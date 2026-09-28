# Production runbooks

## API degradation
Check API gateway /health/services, database latency, upstream timeout rate and unit health. Remove unhealthy instances, rollback the release if correlated with deployment, and declare an incident if SLO burn is material.

## Database
Use managed PostgreSQL metrics first. Check connections, slow queries, storage and replication/backup status. Do not make ad-hoc destructive schema changes. Restore only through the documented drill procedure.

## NATS / event lag
Check JetStream stream state, consumer pending/ack-pending/redelivery and outbox backlog. Restart affected workers only after confirming idempotency. Never purge the stream as a first response.

## Email
Check primary/fallback SMTP metrics and provider status. Candidate communications may be replayed only through idempotent source events.

## Document scanning
If scanner health fails, document service remains fail-closed with SCAN_PENDING. Do not enable development bypass in production. Restore scanner capacity or quarantine affected uploads.

## Cloudflare
Validate DNS proxy state and WAF changes. Emergency rules require incident/change records and subsequent review.

## Restore
Use `npm run db:restore-drill` regularly. Production restoration requires incident commander approval, a selected recovery point, isolated validation, and reconciliation before reopening writes.
