# Stage 10 — Release assurance

Stage 10 defines the repository gate for a Raeburn Talent change to move from source control to production.

## Required flow

`commit → deterministic install → migration/contracts/types/unit → integration/isolation/failure/load → browser/accessibility → security → signed immutable image → staging → smoke/DAST → production approval → blue/green deploy → smoke → release record`

Production and staging deploy the same image digest. A failed production smoke test invokes the deployment rollback contract and fails the release.

## Test gates

- Unit tests: Vitest across shared packages and service tests.
- Contract/event tests: event registry/version compatibility and policy contracts.
- Migration validation: every database-owning service requires immutable numbered migrations; destructive migrations require explicit reviewed approval markers.
- Service integration: local PostgreSQL, PgBouncer and NATS with the full service platform.
- Application/publication/privacy journey: disposable vacancy publication, public discovery, application, candidate portal, verified DSAR and vacancy closure.
- RBAC and tenant isolation: authenticated claim tenant override, public tenant spoof protection, protected-route authentication and read-only write denial.
- Malware policy: fail closed without scanner and quarantine unsafe results.
- Browser/mobile: Playwright Desktop Chrome and Pixel 7.
- Accessibility: Axe WCAG 2.2 AA serious/critical gate plus keyboard focus test.
- Failure injection: malformed requests must fail safely while the gateway remains healthy.
- Performance/load smoke: concurrent public-job traffic with an enforced p95 threshold.
- Backup/restore: CI creates a custom-format PostgreSQL backup, restores it into a disposable database and verifies application tables.
- DAST: OWASP ZAP baseline against staging.

## CI/CD controls

- `package-lock.json` is committed and installs use `npm ci`.
- Lockfile verification is non-mutating and fails if manifests and lockfile diverge.
- Changed-workspace detection drives parallel workspace validation.
- Frontends are built on every deterministic CI run.
- Production Docker image build is tested and scanned for HIGH/CRITICAL vulnerabilities.
- CodeQL, Gitleaks, Trivy filesystem/IaC/container scans and SPDX SBOM run in Security.
- Release qualification requires both CI and the Security workflow to pass for the exact commit SHA.
- Images are pushed to GHCR, resolved to an immutable digest and keylessly signed with Cosign/OIDC.
- Preview deployments are supported for pull requests through an isolated deployment webhook.
- Staging deploys first and must pass smoke tests; optional release DAST can be made mandatory with `DAST_ON_RELEASE=true`.
- Production uses the GitHub `production` environment so repository environment protection can require human approval.
- Production strategy is `blue-green`; failed smoke tests trigger rollback and fail the release.
- Successful releases receive an immutable GitHub release/tag.

## Infrastructure as code

OpenTofu/Terraform owns the environment shape for staging and production:

- DigitalOcean private VPC
- managed PostgreSQL
- persistent NATS JetStream host
- runtime host
- private firewall policy
- Cloudflare R2 document bucket
- Cloudflare proxied API/webhook DNS
- environment project ownership/cost tags
- provider CPU alerting
- encrypted remote state contract
- validation, plan, approval-gated apply and scheduled drift detection

Application secrets are not stored in Terraform state. They are supplied from GitHub environment/provider secret stores at deployment time.

## Required GitHub configuration

Repository/environment variables:
- `RELEASE_ENABLED=true` — enables automatic release after green CI.
- `PREVIEW_DEPLOY_ENABLED=true` — optional real PR previews.
- `DAST_ON_RELEASE=true` — recommended for staging release qualification.
- `IAC_PLAN_ENABLED=true` — enables main-branch IaC plans.
- `TF_DRIFT_ENABLED=true` — enables scheduled production drift checks.

Staging/production environment secrets:
- `DEPLOY_WEBHOOK_URL`
- `DEPLOY_WEBHOOK_TOKEN`
- `TF_BACKEND_HCL`
- `DIGITALOCEAN_TOKEN`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_ZONE_ID`
- `TF_VAR_SSH_KEY_FINGERPRINTS` as Terraform JSON/HCL list
- `TF_VAR_INTERNET_EGRESS_CIDRS` as Terraform JSON/HCL list
- optional `TF_VAR_ALERT_EMAILS`

Environment variables:
- staging `BASE_URL`
- production `BASE_URL`
- optional repository `STAGING_BASE_URL` for scheduled DAST.

The production GitHub environment should require an approved reviewer. Provider secrets must only be exposed to their corresponding protected environment.

## Completion rule

Stage 10 is code-complete only when CI, Security and Infrastructure validation are green at the same head commit. Deployment activation is an environment/provisioning action: release jobs intentionally remain skipped until the required protected variables, secrets, deployment endpoint and provider accounts are configured.
