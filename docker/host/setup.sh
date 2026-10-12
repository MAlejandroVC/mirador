#!/usr/bin/env bash
# Installs or updates a Mirador server on Ubuntu 24.04 (Intel or ARM). Run it again at
# any time to pick up new versions of these files; it never touches .env or the data.
#
#   curl -fsSLO https://raw.githubusercontent.com/MAlejandroVC/mirador/main/docker/host/setup.sh
#   sudo MIRADOR_DOMAIN=mirador.example.com PREVIEW_DOMAIN=preview.example.com \
#     ACME_EMAIL=you@example.com bash setup.sh
#
# See docs/hosting-oracle.md.
set -euo pipefail

ref=${MIRADOR_REF:-main}
base="https://raw.githubusercontent.com/MAlejandroVC/mirador/$ref/docker/host"
dir=/opt/mirador

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this with sudo." >&2
  exit 1
fi

echo "Installing Docker, age and rclone"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq docker.io docker-compose-v2 age rclone curl unattended-upgrades >/dev/null
systemctl enable --now docker

# Oracle's Ubuntu images reject every new connection except SSH in iptables, on top of the
# cloud firewall (the VCN security list). Allow HTTP and HTTPS before that reject rule.
if command -v netfilter-persistent >/dev/null; then
  for rule in 'tcp --dport 80' 'tcp --dport 443' 'udp --dport 443'; do
    # shellcheck disable=SC2086
    if ! iptables -C INPUT -m state --state NEW -p $rule -j ACCEPT 2>/dev/null; then
      position=$(iptables -L INPUT --line-numbers | awk '/REJECT/ { print $1; exit }')
      # shellcheck disable=SC2086
      iptables -I INPUT "${position:-1}" -m state --state NEW -p $rule -j ACCEPT
    fi
  done
  netfilter-persistent save >/dev/null
fi

echo "Installing the Mirador files in $dir"
mkdir -p "$dir/backups"
chmod 700 "$dir/backups"
for file in compose.yml Caddyfile backup.sh; do
  curl -fsSL "$base/$file" -o "$dir/$file"
done
chmod 755 "$dir/backup.sh"
for unit in mirador-update.service mirador-update.timer mirador-backup.service mirador-backup.timer; do
  curl -fsSL "$base/$unit" -o "/etc/systemd/system/$unit"
done

if [ ! -f "$dir/.env" ]; then
  : "${MIRADOR_DOMAIN:?Set MIRADOR_DOMAIN, for example mirador.example.com}"
  : "${PREVIEW_DOMAIN:?Set PREVIEW_DOMAIN, for example preview.example.com}"
  : "${ACME_EMAIL:?Set ACME_EMAIL to the email that gets certificate notices}"
  umask 077
  cat >"$dir/.env" <<ENV
# Mirador server settings. Keep this file private; it holds the database passwords.
MIRADOR_DOMAIN=$MIRADOR_DOMAIN
PREVIEW_DOMAIN=$PREVIEW_DOMAIN
ACME_EMAIL=$ACME_EMAIL
POSTGRES_PASSWORD=$(openssl rand -hex 24)
PREVIEW_POSTGRES_PASSWORD=$(openssl rand -hex 24)

# Image tag for the real instance: latest (every release) or a minor such as 0.4.
MIRADOR_TAG=latest

# Backups (docs/hosting-oracle.md). The public key from age-keygen; the private key
# stays off this server. Without it, backups stay on this server only.
BACKUP_AGE_RECIPIENT=
# An rclone remote and folder for off-site copies, such as r2:mirador-backups.
BACKUP_RCLONE_REMOTE=
BACKUP_KEEP_DAYS=14
ENV
  echo "Created $dir/.env"
fi

echo "Starting Mirador"
systemctl daemon-reload
systemctl enable --now mirador-update.timer mirador-backup.timer
systemctl start mirador-update.service

set -a
# shellcheck source=/dev/null
. "$dir/.env"
set +a
echo
echo "Done. Mirador: https://$MIRADOR_DOMAIN  Preview: https://$PREVIEW_DOMAIN"
echo "The first visit can take a minute while Caddy gets the certificates."
if [ -z "${BACKUP_AGE_RECIPIENT:-}" ]; then
  echo "Backups are not encrypted yet: set BACKUP_AGE_RECIPIENT in $dir/.env."
fi
