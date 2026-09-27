create table if not exists privacy_notices(
 id text primary key,tenant_id text not null,version text not null,content_hash text not null,effective_at timestamptz not null,
 unique(tenant_id,version)
);
create table if not exists consent_records(
 id text primary key,tenant_id text not null,candidate_id text not null,notice_version text not null,accepted_at timestamptz not null
);
create table if not exists privacy_requests(
 id text primary key,tenant_id text not null,candidate_id text not null,type text not null,
 status text not null default 'OPEN',created_at timestamptz not null default now(),
 started_at timestamptz,completed_at timestamptz,result jsonb,last_error text
);
alter table privacy_requests add column if not exists started_at timestamptz;
alter table privacy_requests add column if not exists result jsonb;
alter table privacy_requests add column if not exists last_error text;
