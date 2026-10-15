#!/usr/bin/env bash
# Runs a preview of each open pull request at pr-<number>.<PREVIEW_DOMAIN>, and removes
# it when the pull request closes. mirador-previews.timer runs it every 2 minutes.
#
# A pull request gets a preview once .github/workflows/pr-preview.yml has published its
# image (pr-<number>). A new preview starts with a copy of the preview instance's data,
# so the account made there signs in. Previews hold throwaway data only, like the
# preview instance. See docs/hosting-oracle.md.
set -euo pipefail

dir=/opt/mirador
cd "$dir"
set -a
# shellcheck source=/dev/null
. ./.env
set +a
repo=${PREVIEW_REPO:-MAlejandroVC/mirador}
image=ghcr.io/malejandrovc/mirador
# Each preview uses about 300 MB of memory; the newest pull requests win.
max=${PREVIEW_MAX:-4}

preview() {
  local pr=$1
  shift
  PR_NUMBER=$pr docker compose --project-name "mirador-pr-$pr" --file preview-pr.yml "$@"
}

# Open pull requests from this repository's own branches, most recently updated first.
# If GitHub can't be reached, the script stops here and every preview stays as it is.
wanted=$(
  curl -fsSL -H 'Accept: application/vnd.github+json' \
    "https://api.github.com/repos/$repo/pulls?state=open&sort=updated&direction=desc&per_page=100" |
    jq -r --arg repo "$repo" --argjson max "$max" 'limit($max; .[]
      | select(.head.repo.full_name == $repo and (.head.ref | startswith("release-please--") | not)))
      | .number'
)
running=$(docker compose ls --all --format json |
  jq -r '(. // [])[].Name | select(startswith("mirador-pr-")) | ltrimstr("mirador-pr-")')

keep=()
for pr in $wanted; do
  is_running=false
  grep -qx "$pr" <<<"$running" && is_running=true
  # No image yet means its build hasn't finished; try again next time.
  if ! preview "$pr" pull --quiet app 2>/dev/null; then
    $is_running && keep+=("$pr")
    continue
  fi
  if ! $is_running; then
    echo "Starting the preview of pull request #$pr"
    preview "$pr" up --detach --wait db
    if ! docker compose exec -T preview-db pg_dump -U mirador mirador |
      preview "$pr" exec -T db psql --quiet -v ON_ERROR_STOP=1 -U mirador -d mirador >/dev/null; then
      # It starts empty instead; its log then shows a setup code for the first account.
      echo "Couldn't copy the preview data for #$pr; starting it empty" >&2
      preview "$pr" down --volumes
      preview "$pr" up --detach --wait db
    fi
  fi
  # Starts the app, or restarts it when the pull image is new.
  preview "$pr" up --detach app
  keep+=("$pr")
done

for pr in $running; do
  if ! printf '%s\n' "${keep[@]}" | grep -qx "$pr"; then
    echo "Removing the preview of pull request #$pr"
    preview "$pr" down --volumes
    docker image rm "$image:pr-$pr" >/dev/null 2>&1 || true
  fi
done

# One HTTPS site per preview; Caddy gets each certificate on its own.
sites=previews/sites.caddy
{
  echo '# Written by previews.sh: one site per pull request preview.'
  for pr in "${keep[@]}"; do
    # Caddy fills in {$PREVIEW_DOMAIN} itself.
    # shellcheck disable=SC2016
    printf 'pr-%s.{$PREVIEW_DOMAIN} {\n\timport preview\n\treverse_proxy pr-%s:3000\n}\n' "$pr" "$pr"
  done
} >"$sites.new"
if cmp -s "$sites.new" "$sites"; then
  rm "$sites.new"
else
  mv "$sites.new" "$sites"
  docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile
fi
