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

create table if not exists departments(
 id text primary key,tenant_id text not null,organisation_id text not null,name text not null,slug text not null,
 parent_id text,active boolean not null default true,unique(tenant_id,organisation_id,slug)
);
create table if not exists teams(
 id text primary key,tenant_id text not null,organisation_id text not null,department_id text,name text not null,
 manager_user_id text,active boolean not null default true
);
create table if not exists locations(
 id text primary key,tenant_id text not null,organisation_id text,name text not null,country_code text not null default 'GB',
 timezone text not null default 'Europe/London',address jsonb not null default '{}',remote_allowed boolean not null default true,
 active boolean not null default true
);
