create table if not exists organisations(id text primary key,tenant_id text not null,parent_id text,name text not null,slug text not null,legal_entity text,brand jsonb not null default '{}',careers_config jsonb not null default '{}',hiring_config jsonb not null default '{}',unique(tenant_id,slug));
create table if not exists vendors(
 id text primary key,tenant_id text not null,name text not null,vendor_type text not null,status text not null default 'ACTIVE',
 terms jsonb not null default '{}',fee_model jsonb not null default '{}',contact jsonb not null default '{}',
 created_at timestamptz not null default now()
);
create table if not exists vendor_job_access(
 tenant_id text not null,vendor_id text not null,job_id text not null,ownership_days int not null default 180,
 granted_at timestamptz not null default now(),primary key(tenant_id,vendor_id,job_id)
);
create table if not exists vendor_submissions(
 id text primary key,tenant_id text not null,vendor_id text not null,job_id text not null,candidate_id text,
 candidate_email_hash text,status text not null default 'SUBMITTED',fee jsonb not null default '{}',
 submitted_at timestamptz not null default now()
);
