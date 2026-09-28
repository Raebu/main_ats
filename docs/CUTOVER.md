# Production cutover runbook

1. Provision staging from the same Terraform/OpenTofu stack used for production.
2. Configure managed PostgreSQL databases, persistent NATS JetStream, private R2, ClamAV scanner, SMTP, Cloudflare DNS/WAF, OIDC, secrets, monitoring and alerts.
3. Deploy the immutable unit and scanner image digests to staging.
4. Run migrations, smoke tests, DAST, browser E2E and a backup/restore drill.
5. Import the transitional ATS data into service databases using audited migration tooling.
6. Run `node scripts/verify-data-parity.mjs` until jobs, candidates and applications have zero count delta; supplement this with sampled record-level checks.
7. Enable dual-read on selected low-risk flows where migration uncertainty remains. Compare results; do not dual-write without an idempotency design.
8. Move careers and Talent Admin traffic to the separated applications and API gateway.
9. Observe error rate, latency, NATS lag, outbox backlog, email delivery and malware scan outcomes through the agreed soak period.
10. Freeze the legacy ATS to read-only, perform a final delta import and parity check.
11. Remove legacy routes/root Prisma models and archive the transitional application only after rollback criteria are no longer required.
12. Record all evidence in the production proof file and run `npm run stage12:completion-gate`.

Rollback: before legacy retirement, restore traffic to the previous route and stop new-system writes if consistency cannot be guaranteed. After retirement, use database point-in-time recovery and the immutable previous release according to the incident runbook.
