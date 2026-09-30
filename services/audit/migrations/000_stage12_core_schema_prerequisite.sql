-- Stage 12 repair: promote the idempotent audit core schema into the immutable migration chain.
-- Intentionally ordered before the existing historical migrations.
create table if not exists audit_events(id text primary key,tenant_id text not null,event_type text not null,actor text,resource_type text,resource_id text,correlation_id text not null,payload jsonb not null,occurred_at timestamptz not null);create index if not exists audit_corr on audit_events(tenant_id,correlation_id);
alter table audit_events add column if not exists causation_id text;
alter table audit_events add column if not exists producer text;
alter table audit_events add column if not exists event_version int;
create index if not exists audit_causation on audit_events(tenant_id,causation_id);
create index if not exists audit_event_type_time on audit_events(tenant_id,event_type,occurred_at desc);
