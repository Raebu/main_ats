# Stage 10 completion — Testing, CI/CD and infrastructure

Stage 10 is a release-engineering gate, not a claim that external cloud credentials are stored in source control. Provider secrets and production approvals stay in GitHub Environments / the deployment secret store.

## Mandatory test layers
- Unit: Vitest across packages plus document scan-policy tests.
- Contract/event: event registry and policy contract suites.
- Service integration: disposable vacancy → publish → public API → application → candidate portal → privacy request.
- Publication: waits for asynchronous Distribution worker and verifies first-party/Google/JSON/XML/CSV destinations.
- Security integration: RBAC denial, authenticated tenant isolation, public tenant-spoof isolation and unauthenticated-route rejection.
- Browser/mobile: Playwright runs the same journey in Desktop Chrome and Pixel 7 profiles.
- Accessibility: axe WCAG 2.x/2.2 AA serious/critical gate plus keyboard-focus check.
- Failure injection: malformed request rejection without gateway loss.
- Load smoke: concurrent public API requests with p95 threshold.
- Migration: immutable migration validation.
- Backup/restore: PostgreSQL dump/restore drill in CI.
- DAST: OWASP ZAP baseline against staging.

## CI/CD guarantees
- committed npm lockfile and npm ci;
- changed-workspace detection and parallel workspace validation;
- frontend production builds;
- representative production Docker build;
- CodeQL, Gitleaks, Trivy filesystem/IaC/container scans and SPDX SBOM;
- immutable GHCR image digest;
- keyless Cosign image signing through GitHub OIDC;
- staging deployment and smoke test before production;
- GitHub production environment gate;
- blue/green deployment intent;
- automatic rollback when production smoke fails;
- generated GitHub release/tag after successful production;
- preview build/deploy hook for pull requests.

## Infrastructure as code
OpenTofu/Terraform defines separate staging/production stacks for:
- private VPC/network controls;
- managed PostgreSQL and backups;
- persistent NATS JetStream runtime;
- application runtime;
- Cloudflare R2 private documents bucket;
- API and webhook DNS;
- Cloudflare-proxied ingress;
- firewall policy;
- provider monitoring/alerting;
- ownership/environment/cost-centre tags.

Sensitive provider credentials, SSH material, remote-state credentials and deployment credentials are supplied from environment-scoped secrets rather than committed or persisted as plain-text configuration.

## Regression gate
`npm run stage10:completion-gate` verifies the repository still contains every mandatory Stage 10 mechanism. CI runs this on every main-branch push and pull request.

## Promotion
A release may progress only when:
1. CI passes.
2. Security passes for the exact same commit SHA.
3. The immutable image is built and signed.
4. Staging deploys and passes smoke/optional DAST.
5. Production environment approval is granted.
6. Production deploys and passes smoke tests; otherwise rollback is invoked.
7. A release record/tag is published.
