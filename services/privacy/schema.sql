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

create table if not exists retention_policies(
 id text primary key,tenant_id text not null,scope_type text not null default 'TENANT',scope_id text not null,
 data_category text not null,retention_days int not null,action text not null default 'ANONYMISE',
 enabled boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,scope_type,scope_id,data_category)
);
create table if not exists legal_holds(
 id text primary key,tenant_id text not null,candidate_id text not null,reason text not null,
 placed_by text,placed_at timestamptz not null default now(),released_by text,released_at timestamptz
);
create table if not exists suppression_registry(
 tenant_id text not null,contact_hash text not null,reason text not null,created_at timestamptz not null default now(),
 primary key(tenant_id,contact_hash)
);
create table if not exists privacy_audit(
 id text primary key,tenant_id text not null,candidate_id text,action text not null,detail jsonb not null default '{}',
 actor text,created_at timestamptz not null default now()
);
