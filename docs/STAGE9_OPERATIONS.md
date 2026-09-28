# Stage 9 — Event, database, reliability and observability operations

Stage 9 hardens Raeburn Talent so an individual worker, provider or downstream service failure does not silently lose recruitment state.

## Event platform

- NATS JetStream is the event transport. The `TALENT_EVENTS` stream is file-backed and created idempotently.
- Producers publish with JetStream message IDs for broker-side duplicate suppression.
- Workers use `consumeDurable`, explicit ACKs and durable names.
- Failed handlers NAK with exponential delay. Once `maxDeliver` is exhausted, a minimal `platform.dead_letter.v1` record is emitted and the poison message is terminated.
- Audit exposes event-platform status, consumer lag, correlation chains, dead letters and confirmed replay.
- `processEventOnce` provides the common transactional inbox pattern for consumers that require business-level exactly-once semantics.
- Transactional outboxes use `FOR UPDATE SKIP LOCKED` plus expiring publisher leases.
- Sensitive candidate/application/document/interview/assessment/offer/onboarding event payloads are minimised before transport unless explicitly disabled for a controlled migration.
- Structured logs apply recursive sensitive-field redaction before stdout/Loki export.

### Replay rule

Replay is an operator action, never an automatic infinite loop. Check the cause, correct it, then use the Audit dead-letter replay endpoint with explicit `confirm=true`. Replays get a new event ID and preserve correlation/causation links.

## Database controls

Every database-owning service has an immutable numbered migration directory. `npm run migrate:validate` rejects missing migrations, duplicate versions and destructive SQL unless a reviewed expand/contract exception is marked.

Production uses two identities per service:
- `<service>_migrator`: schema/migration privileges.
- `<service>_runtime`: CONNECT, schema USAGE, table DML and sequence use only; CREATE on the public schema is revoked.

Provision with `npm run db:provision-roles` using `DATABASE_ADMIN_URL` and per-service password secrets/files.

Application traffic should use PgBouncer in transaction mode. PostgreSQL enables `track_io_timing`, slow-statement logging and `pg_stat_statements` preload. Production database monitoring must retain query latency, connection saturation, dead tuples, lock waits, disk growth and replication/PITR health.

### Backup and restore

`npm run db:backup` creates one custom-format dump per service plus a SHA-256 manifest. Store the resulting directory in encrypted, access-controlled backup storage with retention independent of the primary cluster.

`npm run db:restore-drill -- /path/to/manifest.json` restores every dump into a disposable database, validates checksum/table presence/migration history, and removes the drill database afterwards.

Production PostgreSQL must additionally have provider-managed continuous WAL/PITR enabled. A release is not production-ready if PITR is disabled. Quarterly restore drills must include both a logical backup and a point-in-time recovery into an isolated environment.

Run `npm run db:maintenance` on a controlled schedule where managed-provider autovacuum policy does not make it redundant.

## Observability

Each HTTP service exposes:
- `/health`: liveness.
- `/ready`: database + NATS readiness.
- `/metrics`: Prometheus metrics.

The shared runtime emits request counts/durations, DB probe latency, outbox backlog, process uptime, JetStream pending/ACK-pending/redelivery counts, circuit state and worker/event counters.

Local observability is Prometheus + Grafana + Tempo + Loki. OpenTelemetry exports distributed Node traces through the OTLP collector. NATS and PostgreSQL exporters provide broker/database visibility.

### SLOs

Production objectives:
- Careers/API availability: 99.9% monthly.
- Successful application acceptance, excluding candidate validation errors: 99.95% monthly.
- Event durability: no acknowledged application-domain event may be silently lost.
- 99% of normal event deliveries should have < 60 seconds pending lag.
- Candidate email provider failure must not roll back an accepted application.
- Job publication provider failure must become visible RETRYING/DLQ state.
- Restore objective: RPO <= 5 minutes with PITR; RTO <= 60 minutes for the recruitment critical path.

Alerts cover service availability, HTTP 5xx ratio, DB latency, outbox backlog, JetStream lag/redelivery, event-handler failures, email failures, publication DLQ, malware latency and search indexing failures.

## Degraded mode

- Analytics, search, AI and outbound communications are asynchronous and cannot make application submission fail after the application transaction commits.
- Communications remain PENDING/retry through durable event redelivery when SMTP is unavailable.
- External distribution records RETRYING then DLQ rather than claiming publication.
- Malware scanning fails closed; unscanned documents remain unavailable.
- Readiness is 503 when a required database or NATS dependency is unavailable so orchestration stops routing new work.
- Circuit breakers stop repeated calls to unhealthy providers and allow recovery after cooldown.

## Disaster recovery sequence

1. Declare the incident and stop writes if integrity is uncertain.
2. Preserve logs, traces, NATS state and database snapshots.
3. Restore PostgreSQL to an isolated environment from PITR or the latest verified logical backup.
4. Restore/attach object storage with versioning intact.
5. Restore JetStream persistent storage or recreate consumers and replay authoritative outbox/audit events where appropriate.
6. Run immutable migrations.
7. Verify service `/ready`, migration checks and critical database counts.
8. Run the synthetic candidate journey in read-only mode, then submission mode against the dedicated synthetic vacancy.
9. Resume API traffic gradually.
10. Reconcile outboxes, event consumer lag, communications, publications and search index.
11. Record the recovery point/time and complete a post-incident review.

## Validation commands

```bash
npm run stage9:validate
npm test
npm run db:backup
npm run db:restore-drill -- /secure/backups/<timestamp>/manifest.json
npm run synthetic:candidate
```

The synthetic monitor is read-only by default. Set `SYNTHETIC_SUBMIT=true` and `SYNTHETIC_JOB_ID` only for a dedicated published synthetic vacancy.
