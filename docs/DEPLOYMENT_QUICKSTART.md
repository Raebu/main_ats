# Raeburn Talent — deployment quick start

This is the operator checklist for first production activation.

## What the repository now deploys

- Backend: signed GHCR unit images deployed directly by GitHub Actions over SSH.
- Edge TLS: Caddy on the runtime host, serving `api.talent.theraeburngroup.com`.
- Data: managed PostgreSQL, separate service databases derived from `DATABASE_BASE_URL`.
- Events: persistent NATS JetStream.
- Files: private Cloudflare R2.
- Malware: ClamAV scanner container.
- Frontends: Vercel projects rooted at `apps/talent-admin` and `apps/careers-web`.

## Required GitHub repository variable

`RELEASE_ENABLED=true`

## GitHub environment: staging

Secrets:
- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`
- `RUNTIME_ENV_FILE`

Variable:
- `BASE_URL`

Use the same names in the production environment with production values.

## Infrastructure workflow credentials

For each GitHub environment used by the Infrastructure workflow configure:
- `DIGITALOCEAN_TOKEN`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_ZONE_ID`
- `TF_VAR_SSH_KEY_FINGERPRINTS`
- `TF_VAR_INTERNET_EGRESS_CIDRS`
- `TF_VAR_ALERT_EMAILS`
- `TF_BACKEND_HCL`
- `TF_STATE_ACCESS_KEY`
- `TF_STATE_SECRET_KEY`

The state backend must already exist. Cloudflare R2 is suitable for the S3 backend.

## First production sequence

1. Create the remote state bucket and credentials.
2. Configure GitHub staging/production environment secrets.
3. Run Infrastructure with staging + apply.
4. Fill staging `RUNTIME_ENV_FILE`, deploy Release, and pass smoke/DAST.
5. Run Infrastructure with production + apply.
6. Create all service databases and run immutable migrations.
7. Fill production `RUNTIME_ENV_FILE`.
8. Point Cloudflare `api.talent.theraeburngroup.com` to the runtime origin and keep it proxied.
9. Run Release for production.
10. Create/import the two Vercel projects and connect `talent.theraeburngroup.com` / `careers.theraeburngroup.com`.
11. Create the first normal platform administrator, verify MFA, then disable bootstrap.
12. Run parity/migration checks before retiring the root ATS.

Never paste private keys, provider tokens or database passwords into chat or commit them to Git.
