create table if not exists documents(id text primary key,tenant_id text not null,candidate_id text not null,application_id text,kind text not null,file_name text not null,mime_type text not null,size_bytes bigint not null,object_key text not null,status text not null default 'PENDING_UPLOAD',created_at timestamptz not null default now());
create table if not exists outbox_events(id text primary key,event_type text not null,payload jsonb not null,created_at timestamptz not null default now(),published_at timestamptz,retry_count int not null default 0,last_error text);
create table if not exists processed_events(event_id text primary key,processed_at timestamptz not null default now());

alter table documents add column if not exists version_group_id text;
alter table documents add column if not exists version_number int not null default 1;
alter table documents add column if not exists supersedes_id text;
alter table documents add column if not exists expires_at timestamptz;
alter table documents add column if not exists updated_at timestamptz not null default now();
create index if not exists documents_candidate_kind_versions on documents(tenant_id,candidate_id,kind,version_number desc);
