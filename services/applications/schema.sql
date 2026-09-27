create table if not exists applications(
 id text primary key,tenant_id text not null,job_id text not null,candidate_id text not null,
 right_to_work text,availability text,cover_note text,privacy_notice_version text not null,privacy_accepted_at timestamptz not null,
 attribution jsonb not null default '{}',answers jsonb not null default '[]',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,job_id,candidate_id)
);
create index if not exists applications_job on applications(tenant_id,job_id);
create table if not exists outbox_events(id text primary key,event_type text not null,payload jsonb not null,created_at timestamptz not null default now(),published_at timestamptz,retry_count int not null default 0,last_error text);