# Database operations and migration policy

Raeburn Talent uses service-owned PostgreSQL databases and forward-only immutable SQL migrations.

## Migration rules

1. Every service with a `schema.sql` must also have a numbered `migrations/` history.
2. A migration is immutable after merge. The runner records a SHA-256 checksum and refuses a changed migration.
3. Production changes use **expand → migrate/backfill → contract**. New code must remain compatible with the immediately previous schema during rollout.
4. Destructive SQL, type narrowing and immediate `SET NOT NULL` are rejected by `npm run migrate:validate` unless the migration contains `-- raeburn:destructive-approved` and has an explicit reviewed rollout plan.
5. Migrations roll forward. Restore/PITR is for disaster recovery, not ordinary application rollback.
6. Long-running online operations such as `CREATE INDEX CONCURRENTLY` may use `-- raeburn:no-transaction`; they must be idempotent because SQL and migration bookkeeping cannot then be atomic.
7. The migration runner takes a PostgreSQL advisory lock per service so only one migrator operates on a service database at a time.

## Roles

Production databases use separate owner/migrator, runtime and monitoring roles. Runtime identities receive only CONNECT, schema USAGE, and the DML/sequence privileges needed by that service. No service identity receives privileges on another service database.

## Pooling

Applications should connect through PgBouncer in transaction mode. Migrations and administrative operations connect directly to PostgreSQL because session/advisory semantics and DDL should not be routed through transaction pooling.

## Backups and PITR

Production PostgreSQL must have encrypted automated backups and continuous WAL/PITR enabled at the managed-provider layer. The repository backup tool creates a portable logical recovery copy in addition to provider-native PITR. Restore drills are performed against a disposable database and must pass schema-migration and smoke checks.

## Query operations

Enable `pg_stat_statements` on production PostgreSQL. Slow-query reporting, connection saturation, lock waits and database latency feed monitoring and alerts. Autovacuum remains enabled; maintenance automation runs ANALYZE and reports table/index growth rather than issuing unsafe blanket VACUUM FULL operations.
