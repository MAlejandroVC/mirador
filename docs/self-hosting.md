# Running Mirador on your own server

Mirador ships as one Docker image, `ghcr.io/malejandrovc/mirador`, that serves both the web app and its API. It needs PostgreSQL next to it and HTTPS in front of it. Everything it stores is encrypted in the browser first, so the server and its backups only ever hold ciphertext.

> Mirador is early: you can create accounts and sign in, but there is no data to keep yet. This guide grows with it (NFR-15).

For a step-by-step setup on a free cloud server, with a preview instance and encrypted off-site backups, see [hosting-oracle.md](hosting-oracle.md). The files it installs are in `docker/host/` and work on any Ubuntu 24.04 server.

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
| `MIRADOR_OPEN_SIGNUP` | `false` | `true` lets anyone who can open the app create an account. Leave it off and invite people instead (SYS-13) |
| `MIRADOR_TRUST_PROXY` | `true` | Sign-in attempt limits count by the visitor's address from the proxy's `X-Forwarded-For` header. Set `false` only if nothing sits in front of the app |

## Create the first account

A new server has no accounts, and it won't let just anyone who finds its address create the first one. At every start it prints a setup code in its log while no account exists. From the folder with `docker-compose.yml`:

```bash
sudo docker compose logs app | grep "setup code" | tail -1
# No accounts yet. Create the first one in the app with this setup code: 7KQ2-…
```

Every restart (an update, a reboot) prints a new code, and only the newest one works, hence `tail -1`.

Open the app, choose **Create an account** and enter that code with a username and password. The username can be anything; Mirador never asks for an email. The app then shows your **recovery key** once: save it somewhere safe. Your password and recovery key never reach the server, so nobody, including you as the server's operator, can reset them. Lose both and the data is gone for good.

That first account runs the server. On a server that already had accounts before invites existed, the oldest account does.

## Invite people

After the first account, only invited people can sign up. Signed in with the first account, choose **Invite someone** on the home screen, then **Make an invite link**, and send the link to the person yourself (Mirador sends no email or messages). Each link works for one account, for 7 days. The app shows it only once, because the server keeps only a hash of it; if you lose it, withdraw the invite and make another. The same screen lists your invites and who used each one.

To let anyone who can reach the app sign up instead, set `MIRADOR_OPEN_SIGNUP=true` in `.env` and run `docker compose up -d`.

## Add HTTPS

Any reverse proxy that serves HTTPS and adds the `X-Forwarded-For` header works. With [Caddy](https://caddyserver.com) installed on the same machine, this `Caddyfile` gets and renews a certificate on its own:

```text
mirador.example.com {
	reverse_proxy 127.0.0.1:3000
}
```

Passkeys and Face ID unlock belong to the address people use, such as `mirador.example.com`. If that address changes, passkeys made for the old one stop working; everyone can still sign in with their password and add a passkey again.

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
