create table if not exists touchpoints(id text primary key,tenant_id text not null,visitor_id text,session_id text,job_id text,source text,gateway text,campaign text,referrer text,utm jsonb not null default '{}',landing_page text,occurred_at timestamptz not null default now());
create table if not exists conversions(id text primary key,tenant_id text not null,application_id text not null,job_id text not null,candidate_id text not null,attribution jsonb not null default '{}',created_at timestamptz not null default now(),unique(tenant_id,application_id));
create table if not exists referrals(
 id text primary key,tenant_id text not null,referral_code text not null,referrer_type text not null,referrer_id text,
 job_id text,candidate_email_hash text,status text not null default 'ACTIVE',metadata jsonb not null default '{}',
 created_at timestamptz not null default now(),unique(tenant_id,referral_code)
);
create table if not exists referral_claims(
 id text primary key,tenant_id text not null,referral_id text not null,application_id text,candidate_id text,
 status text not null default 'ATTRIBUTED',reward jsonb not null default '{}',created_at timestamptz not null default now()
);
create table if not exists attribution_rules(
 id text primary key,tenant_id text not null,name text not null,priority int not null default 100,
 rule jsonb not null,active boolean not null default true,created_at timestamptz not null default now()
);
