create table if not exists fact_events(event_id text primary key,tenant_id text not null,event_type text not null,occurred_at timestamptz not null,payload jsonb not null);create index if not exists fact_events_type on fact_events(tenant_id,event_type,occurred_at);
create table if not exists report_definitions(
 id text primary key,tenant_id text not null,name text not null,report_type text not null,
 config jsonb not null default '{}',allowed_roles jsonb not null default '[]',pii_mode text not null default 'REDACTED',created_by text,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists report_runs(
 id text primary key,tenant_id text not null,report_definition_id text,report_type text not null,format text not null,
 status text not null,parameters jsonb not null default '{}',row_count int,created_by text,
 created_at timestamptz not null default now(),completed_at timestamptz,last_error text,pii_mode text not null default 'REDACTED'
);
create table if not exists data_quality_runs(
 id text primary key,tenant_id text not null,status text not null,summary jsonb not null default '{}',
 issues jsonb not null default '[]',remediation jsonb not null default '{}',created_at timestamptz not null default now(),completed_at timestamptz
);

alter table report_definitions add column if not exists allowed_roles jsonb not null default '[]';
alter table report_definitions add column if not exists pii_mode text not null default 'REDACTED';
alter table report_runs add column if not exists pii_mode text not null default 'REDACTED';
create table if not exists report_exports(
 id text primary key,tenant_id text not null,token_hash text not null unique,report_type text not null,format text not null,
 content_type text not null,filename text not null,payload_base64 text not null,pii_mode text not null default 'REDACTED',
 created_by text,created_at timestamptz not null default now(),expires_at timestamptz not null,downloaded_at timestamptz,
 download_count int not null default 0,schedule_id text
);
create index if not exists report_exports_expiry on report_exports(tenant_id,expires_at);
create table if not exists report_schedules(
 id text primary key,tenant_id text not null,name text not null,report_type text not null,format text not null default 'PDF',
 frequency text not null default 'WEEKLY',recipients jsonb not null default '[]',parameters jsonb not null default '{}',
 pii_mode text not null default 'REDACTED',enabled boolean not null default true,next_run_at timestamptz,last_run_at timestamptz,
 last_status text,last_error text,created_by text,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists report_schedules_due on report_schedules(enabled,next_run_at);
create table if not exists bi_connectors(
 id text primary key,tenant_id text not null,name text not null,connector_type text not null default 'HTTP_JSON',
 endpoint text not null,secret_env text,status text not null default 'ACTIVE',last_push_at timestamptz,last_error text,
 created_by text,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);

alter table report_exports add column if not exists schedule_id text;

alter table data_quality_runs add column if not exists remediation jsonb not null default '{}';
