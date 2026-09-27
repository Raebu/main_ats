create table if not exists touchpoints(id text primary key,tenant_id text not null,visitor_id text,session_id text,job_id text,source text,gateway text,campaign text,referrer text,utm jsonb not null default '{}',landing_page text,occurred_at timestamptz not null default now());
create table if not exists conversions(id text primary key,tenant_id text not null,application_id text not null,job_id text not null,candidate_id text not null,attribution jsonb not null default '{}',created_at timestamptz not null default now(),unique(tenant_id,application_id));
create table if not exists referrals(
 id text primary key,tenant_id text not null,referral_code text not null,referrer_type text not null,referrer_id text,
 job_id text,candidate_email_hash text,status text not null default 'ACTIVE',metadata jsonb not null default '{}',
 ownership_days int not null default 180,reward_scheme jsonb not null default '{}',created_at timestamptz not null default now(),unique(tenant_id,referral_code)
);
create table if not exists referral_claims(
 id text primary key,tenant_id text not null,referral_id text not null,application_id text,candidate_id text,
 status text not null default 'ATTRIBUTED',reward jsonb not null default '{}',ownership_expires_at timestamptz,
 created_at timestamptz not null default now()
);
create unique index if not exists referral_application_once on referral_claims(tenant_id,application_id) where application_id is not null;
create table if not exists referral_rewards(
 id text primary key,tenant_id text not null,referral_claim_id text not null,amount numeric,currency text not null default 'GBP',
 status text not null default 'PENDING',reason text,approved_by text,approved_at timestamptz,paid_at timestamptz,created_at timestamptz not null default now()
);
create table if not exists referral_fraud_flags(
 id text primary key,tenant_id text not null,referral_id text,claim_id text,flag_type text not null,severity text not null default 'MEDIUM',
 detail jsonb not null default '{}',status text not null default 'OPEN',created_at timestamptz not null default now(),resolved_at timestamptz,resolved_by text
);
create table if not exists attribution_rules(
 id text primary key,tenant_id text not null,name text not null,priority int not null default 100,
 rule jsonb not null,active boolean not null default true,created_at timestamptz not null default now()
);
