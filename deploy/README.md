# OVH deployment

Public hostname: `wseagent.clicksalesmedia.work`. DNS A record: `148.113.59.227`.

The stack uses a standalone Next.js image, a private Python API, and Caddy for automatic HTTPS. Only Caddy publishes host ports. Certificate data is stored in named Docker volumes. Voice media travels directly between the browser and OpenAI; the backend creates the WebRTC session.

## First deployment

Install Docker Engine and its Compose plugin using the instructions for the server's OS. Ensure ports 80 and 443 are available and reachable, and that SSH remains accessible. Do not replace an existing reverse proxy without integrating its other sites.

```sh
git clone https://github.com/mounirbennassar/wseagent.git /opt/hala
cd /opt/hala
cp .env.production.example .env.production
chmod 600 .env.production
```

Edit `.env.production` on the server. Never commit it. The frontend image must never receive the OpenAI key as a build argument. To protect the demo, set `DEMO_USERNAME` and a bcrypt password hash:

```sh
docker run --rm -it caddy:2.11-alpine caddy hash-password
```

Paste the resulting hash inside single quotes in `.env.production`. To intentionally allow public access, use `CADDY_ACCESS_FILE=./deploy/access.public.caddy`. Public access allows anyone to make billable voice/chat requests; the local demo request limit is not a comprehensive usage budget.

```sh
docker compose --env-file .env.production config --quiet
docker compose --env-file .env.production up -d --build --wait
docker compose --env-file .env.production ps
```

Visit the HTTPS hostname. Caddy obtains and renews its certificate automatically. The backend only permits that HTTPS origin, and trusts forwarded client addresses only because its port is private behind Caddy on the dedicated Compose network. Run one backend worker so the in-memory per-client limit stays consistent. Use a shared limiter before scaling.

## Update

```sh
cd /opt/hala
git status --short
git pull --ff-only
docker compose --env-file .env.production up -d --build --wait
```

For rollback, check out a previously verified commit and rebuild with the same command. Preserve `.env.production` and the `caddy_data` volume; do not run `down -v`.

## Verify and inspect

```sh
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs --tail=80
```

Check `/api/health` and `/api/knowledge`, then try a real chat and microphone call through the HTTPS website. With password protection, authenticate in the browser first. Check mute, end-call cleanup, transcripts, and both mobile language layouts. A generated OpenAI voice still requires subjective Saudi-speaker review.

The app is a demo, with no CRM, payment or booking integration. The ten-minute voice limit runs in the browser; it is not a server-enforced maximum or spending cap. For an open public launch, add server-enforced session limits and account-level budget monitoring.

References: [Docker installation](https://docs.docker.com/engine/install/ubuntu/), [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), [Caddy authentication](https://caddyserver.com/docs/caddyfile/directives/basic_auth).
