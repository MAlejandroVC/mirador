# Hosting Mirador on Oracle Cloud's free tier

This sets up Mirador on an Oracle Cloud "Always Free" ARM server, at no cost, with:

- the **real instance** at your domain, updated when a release is published;
- a **preview instance** on a second domain, updated with every merge to `main`, for throwaway data only;
- HTTPS from Let's Encrypt, renewed on its own;
- a nightly **encrypted backup**, optionally copied to a second provider.

It takes about an hour the first time. You need a credit or debit card (Oracle checks it but doesn't charge for free resources) and a domain name. [self-hosting.md](self-hosting.md) explains what the server can and can't see.

## What the free tier gives, and its risks

Oracle's [Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm) include ARM servers up to 2 CPUs and 12 GB of memory in total, 200 GB of disk and 10 TB of traffic a month. That is far more than a few users need.

Two things can take the server away, so the backups below are not optional:

- **Idle servers can be reclaimed.** Oracle may reclaim a free server whose CPU, network and memory use all stay under 20% for a week, which describes a small Mirador server. Upgrading the account to Pay As You Go (step 1) is widely reported to stop this, though Oracle doesn't promise it.
- **Limits change.** In June 2026 Oracle halved the free ARM allowance with no notice and shut down servers above the new limit. Stay within 2 CPUs and 12 GB in total.

## 1. Create the account

1. Sign up at [oracle.com/cloud/free](https://www.oracle.com/cloud/free/).
2. Choose the **home region** carefully: free servers only run there and it can't be changed. Pick the one closest to you.
3. Once the account is active, upgrade it to **Pay As You Go** (Billing and cost management → Upgrade and manage payment). Free resources stay free, and paid accounts get spare ARM capacity first.
4. Add a budget alert so nothing is billed by surprise: Billing and cost management → Budgets → Create budget, amount 1 (in your currency), alert at 1%.

## 2. Create the server

Create the network first; the instance form can't give a public address to a network it creates itself. Networking → Virtual cloud networks → Start VCN Wizard → "Create VCN with Internet Connectivity", name it `mirador-vcn`, keep the defaults.

Then Compute → Instances → Create instance:

| Setting | Value |
| --- | --- |
| Image | Canonical Ubuntu 24.04 (the aarch64 build is picked for you with an ARM shape) |
| Shape | Ampere → `VM.Standard.A1.Flex`, 2 OCPUs, 12 GB memory |
| Networking | Select existing virtual cloud network `mirador-vcn` and its public subnet; turn on "Automatically assign public IPv4 address" |
| SSH keys | Upload your public key, or let Oracle generate a pair and download the private key before pressing Create (it isn't shown again) |
| Boot volume | 100 GB |

If it says "Out of capacity", try another availability domain, or again later.

When it's running, give it an address that survives the server being stopped: the instance → Attached VNICs → the VNIC → IPv4 addresses → Edit → Reserved public IP → create one. That replaces the first address, so note the **new public IP** and use it from here on.

## 3. Open the web ports

Networking → Virtual cloud networks → `mirador-vcn` → Security → the default security list → Add ingress rules, with source `0.0.0.0/0`:

| Protocol | Destination port |
| --- | --- |
| TCP | 80 |
| TCP | 443 |
| UDP | 443 |

The setup script opens the same ports in the server's own firewall.

## 4. Point the domains at it

At your DNS provider, add two `A` records to the public IP, for example `mirador.example.com` and `preview.example.com`.

If the domain is on Cloudflare, set both records to **DNS only** (grey cloud). Proxying through Cloudflare decrypts the traffic on Cloudflare's servers, where the web app could be changed on its way to you and receipts sent for reading could be seen.

## 5. Install Mirador

The image must be public on GitHub Container Registry first (Packages → `mirador` → Package settings → Change visibility → Public).

```bash
ssh ubuntu@<public IP>
curl -fsSLO https://raw.githubusercontent.com/MAlejandroVC/mirador/main/docker/host/setup.sh
sudo MIRADOR_DOMAIN=mirador.example.com PREVIEW_DOMAIN=preview.example.com \
  ACME_EMAIL=you@example.com bash setup.sh
```

It installs Docker, writes `/opt/mirador` (settings in `/opt/mirador/.env`), and starts both instances behind Caddy. Open both addresses; the first visit can take a minute while the certificates are issued.

## 6. Turn on encrypted backups

Every night at 03:30 (server time) the real instance's database is dumped to `/opt/mirador/backups` and kept for 14 days. To encrypt it and keep a copy away from Oracle:

1. On **your own computer**, install [age](https://age-encryption.org) and create a key:

   ```bash
   age-keygen -o mirador-backup-key.txt
   ```

   Store that file in your password manager. It is the only way to open the backups, and it must never be on the server.

2. Put the public key it printed (`age1…`) in `/opt/mirador/.env` as `BACKUP_AGE_RECIPIENT`.

3. For the off-site copy, create a bucket with any S3-compatible storage, for example Cloudflare R2 or Backblaze B2 (both have a free tier of 10 GB), and an access key limited to that bucket. Then, on the server:

   ```bash
   sudo rclone config --config /opt/mirador/rclone.conf   # add a remote named r2 (or b2)
   ```

   and set `BACKUP_RCLONE_REMOTE=r2:<bucket name>` in `/opt/mirador/.env`. Only encrypted backups are ever copied.

4. Test it: `sudo systemctl start mirador-backup && journalctl -u mirador-backup -n 20`.

## Day to day

| Task | Command (on the server) |
| --- | --- |
| See what's running | `cd /opt/mirador && sudo docker compose ps` |
| Logs | `sudo docker compose logs --tail 100 app` (or `preview-app`, `caddy`) |
| Update now instead of waiting up to 15 minutes | `sudo systemctl start mirador-update` |
| When updates and backups run next | `systemctl list-timers 'mirador-*'` |
| Update these server files | Run `setup.sh` again; it keeps `.env` and the data |

Ubuntu installs its own security updates every night.

## Restore a backup

On your computer, decrypt the backup, then copy it to the server and load it into an empty database:

```bash
age -d -i mirador-backup-key.txt mirador-2026-10-12T033000Z.sql.gz.age > restore.sql.gz
scp restore.sql.gz ubuntu@<public IP>:
ssh ubuntu@<public IP>
cd /opt/mirador
sudo docker compose stop app
sudo docker compose exec -T db dropdb -U mirador mirador
sudo docker compose exec -T db createdb -U mirador mirador
gunzip -c ~/restore.sql.gz | sudo docker compose exec -T db psql -U mirador -d mirador
sudo docker compose start app
rm ~/restore.sql.gz
```

On a new server, run `setup.sh` first, then restore.
