create table if not exists fact_events(event_id text primary key,tenant_id text not null,event_type text not null,occurred_at timestamptz not null,payload jsonb not null);create index if not exists fact_events_type on fact_events(tenant_id,event_type,occurred_at);
create table if not exists report_definitions(
 id text primary key,tenant_id text not null,name text not null,report_type text not null,
 config jsonb not null default '{}',created_by text,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists report_runs(
 id text primary key,tenant_id text not null,report_definition_id text,report_type text not null,format text not null,
 status text not null,parameters jsonb not null default '{}',row_count int,created_by text,
 created_at timestamptz not null default now(),completed_at timestamptz,last_error text
);
create table if not exists data_quality_runs(
 id text primary key,tenant_id text not null,status text not null,summary jsonb not null default '{}',
 issues jsonb not null default '[]',created_at timestamptz not null default now(),completed_at timestamptz
);
