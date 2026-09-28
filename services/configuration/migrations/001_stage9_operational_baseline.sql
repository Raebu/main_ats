-- Stage 9 operational reliability baseline.
-- Immutable after merge. Future changes must use a new numbered migration.
create table if not exists event_inbox(
  event_id text primary key,
  event_type text not null,
  correlation_id text not null,
  first_seen_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists event_inbox_processed_idx on event_inbox(processed_at) where processed_at is null;

do $$
begin
  if to_regclass('public.outbox_events') is not null then
    alter table outbox_events add column if not exists lease_owner text;
    alter table outbox_events add column if not exists lease_until timestamptz;
    execute 'create index if not exists outbox_ready_idx on outbox_events(created_at) where published_at is null';
  end if;
end $$;
