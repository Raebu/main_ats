# Stage 12 — production activation, migration and commercialisation

Stage 12 is the final production cutover. The repository distinguishes **production readiness** from **live activation**.

- `npm run stage12:readiness-gate` proves the codebase contains the required production, commercialisation, migration and operational controls.
- `npm run stage12:completion-gate` additionally requires a production proof file and verifies that the transitional root ATS has actually been retired.

The live gate is intentionally fail-closed. Infrastructure plans, mocked integrations or documentation are not accepted as evidence that Raeburn Talent is live.

## Production dependencies

Production requires managed PostgreSQL, persistent JetStream NATS, private Cloudflare R2, the ClamAV scanner service, production SMTP, Cloudflare proxied DNS/WAF, at least one approved OIDC provider, backups, monitoring and alerting. Staging uses the same Terraform stack and immutable deployment images as production.

## Deployment units

The backend is consolidated into the units in `infrastructure/production/deployment-units.json`. One immutable unit image is promoted through staging and production; `UNIT_NAME` selects the logical unit. Malware scanning uses its own ClamAV image. Only `edge-api` is internet facing.

## Commercialisation

`services/platform` and Talent Admin `/platform` provide tenant provisioning, brand configuration, entitlements, subscriptions, usage meters, billing ledger, customer support, custom-domain verification, API keys, onboarding/offboarding state, regional deployment requests and SLA policies.

## Final completion

Stage 12 is complete only after `scripts/verify-stage12-live.mjs` passes against signed production evidence and the legacy root Prisma/app artifacts have been removed after successful cutover.
