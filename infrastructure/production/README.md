# Raeburn Talent production deployment

The platform is split into stateless HTTP services, event workers, outbox publishers, two Next.js frontends, PostgreSQL service databases, NATS, and private S3-compatible object storage.

## Frontends

Deploy `apps/careers-web` and `apps/talent-admin` independently. Vercel is suitable for these Next.js applications. Set `TALENT_API_URL` to the public API Gateway URL. The careers app also requires `TALENT_TENANT_ID` and `CAREERS_BASE_URL`.

## Long-running services

Run the HTTP services and workers on a container platform that supports continuously running processes. Build `Dockerfile.workspace` with a workspace such as `@raeburn/jobs-service`. Build `Dockerfile.worker` for each workspace script named `worker` or `outbox`.

Only the API Gateway should be internet-facing. Domain service ports should remain private on the service network.

## Required infrastructure

- PostgreSQL: one managed cluster is sufficient, but each service must use its own database/schema ownership boundary.
- NATS with JetStream enabled.
- S3-compatible private object storage; Cloudflare R2 is the intended production target.
- SMTP or transactional email provider.
- Malware scanning endpoint for candidate documents.
- Secret manager for service credentials and signing keys.

## Required secrets

At minimum:

- `AUTH_SECRET` (transitional/fallback only; production access tokens use RS256)
- `AUTH_PRIVATE_KEY_PEM` and `AUTH_PUBLIC_KEY_PEM`, with `AUTH_KEY_ID`; keep previous verification keys in `AUTH_PUBLIC_KEYS_JSON` during key rotation
- `MFA_ENCRYPTION_KEY`
- `TENANT_ENCRYPTION_MASTER_KEY`
- `SERVICE_AUTH_SECRET`; signed service-to-service authentication is mandatory automatically in production (`REQUIRE_SERVICE_AUTH=true` can also enforce it in non-production environments)
- `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGIN`
- `TALENT_ADMIN_URL`
- `PASSWORD_RESET_WEBHOOK_URL` and `PASSWORD_RESET_WEBHOOK_SECRET` when reset delivery is enabled
- `APPLICATION_UPLOAD_SECRET`
- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_PASSWORD` only for initial provisioning; permanently disable bootstrap after a real platform administrator is created
- per-service `DATABASE_URL`
- `NATS_URL`
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- `MALWARE_SCANNER_URL` and scanner credentials when used

Sensitive values support either the direct variable or a same-name `_FILE` variable pointing at a mounted secret-manager file where the consuming component uses the shared secret loader. Do not commit private keys, client secrets, service-auth secrets, encryption keys or password-reset webhook secrets.

### SSO provider configuration

Configure `google` and/or `microsoft` in Identity Service `identity_providers` with an explicit OIDC issuer, client ID, callback URI, allowed domains and the environment-variable name holding the client secret. Keep `allowAutoProvision` disabled unless automatic account creation is an intentional policy; otherwise provision Talent users and organisation memberships before SSO login.

Do not enable `DOCUMENT_SCAN_MODE=development-bypass` in production.

## Deployment order

1. Provision PostgreSQL databases, NATS and object storage.
2. Apply each service `schema.sql` and any approved seed data.
3. Start domain HTTP services.
4. Start outbox publishers and event workers.
5. Start API Gateway and verify `/health/services`.
6. Deploy Talent Admin and create a real administrator account.
7. Rotate/remove bootstrap administrator credentials.
8. Deploy Careers Web.
9. Publish a test vacancy and verify canonical careers page, feeds, application submission, document quarantine, workflow creation, communications and analytics.
10. Configure approved external job-board connectors only after provider credentials/contracts exist.

## Rollout guardrails

Keep job-board connectors fail-closed. A destination must never be reported as live unless its adapter has confirmed publication. Keep candidate documents private and unavailable until they reach `PROCESSED`. Keep the transitional root application available during migration until production traffic has been validated against the separated apps and services.
