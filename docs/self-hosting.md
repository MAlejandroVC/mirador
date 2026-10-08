# Running Mirador on your own server

Mirador ships as one Docker image, `ghcr.io/malejandrovc/mirador`, that serves both the web app and its API. It needs PostgreSQL next to it and HTTPS in front of it. Everything it stores is encrypted in the browser first, so the server and its backups only ever hold ciphertext.

> Mirador is early: the image starts and serves the app, but there are no accounts or data yet. This guide grows with it (NFR-15).

## What you need

- A machine with Docker and Docker Compose, Intel/AMD or ARM (a small VPS, a home server, a Raspberry Pi 4 or newer).
- A domain or subdomain pointing at it, for HTTPS. The browser only allows the encryption Mirador uses on HTTPS pages (or on `localhost`).

## Start it

```bash
mkdir mirador && cd mirador
curl -fsSLO https://raw.githubusercontent.com/MAlejandroVC/mirador/main/docker/docker-compose.yml
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" > .env
docker compose up -d
curl http://127.0.0.1:3000/api/health   # {"status":"ok"}
```

The app listens on `127.0.0.1:3000`, so only the machine itself can reach it. Settings go in `.env`:

| Setting | Default | Meaning |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | (required) | Database password. Keep it in `.env` only |
| `MIRADOR_TAG` | `latest` | Image tag to run (see below) |
| `MIRADOR_PORT` | `3000` | Port on 127.0.0.1 the app listens on |

## Add HTTPS

Any reverse proxy works. With [Caddy](https://caddyserver.com) installed on the same machine, this `Caddyfile` gets and renews a certificate on its own:

```text
mirador.example.com {
	reverse_proxy 127.0.0.1:3000
}
```

## Choose what to run

| `MIRADOR_TAG` | You get |
| --- | --- |
| `latest` | Every release as soon as you update. The normal choice |
| `1.4` (a minor version) | Fixes for 1.4 only; you move to 1.5 yourself |
| `main` | Every change as soon as it is merged, before it is released. For testing with throwaway data only |

## Update

```bash
docker compose pull && docker compose up -d
```

To update on its own, run that every night from cron or a systemd timer. Read the release notes on GitHub for anything a release asks you to do.
