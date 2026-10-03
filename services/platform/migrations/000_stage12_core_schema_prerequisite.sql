-- Stage 12 repair: promote the idempotent platform core schema into the immutable migration chain.
-- Intentionally ordered before the existing historical migrations.
create table if not exists platform_tenants(
 tenant_id text primary key,name text not null,slug text not null unique,status text not null default 'PROVISIONING',
 region text not null default 'uk',plan_key text not null default 'internal',brand jsonb not null default '{}',
 onboarding jsonb not null default '{}',offboarding jsonb not null default '{}',created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists entitlements(
 tenant_id text not null,key text not null,enabled boolean not null default true,limit_value numeric,
 source text not null default 'PLAN',updated_at timestamptz not null default now(),primary key(tenant_id,key)
);
create table if not exists subscriptions(
 id text primary key,tenant_id text not null,provider text not null default 'MANUAL',provider_customer_id text,provider_subscription_id text,
 plan_key text not null,status text not null,currency text not null default 'GBP',amount_minor bigint not null default 0,
 billing_interval text not null default 'MONTHLY',current_period_start timestamptz,current_period_end timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists subscriptions_tenant on subscriptions(tenant_id,status);
create table if not exists usage_meters(
 tenant_id text not null,meter_key text not null,period_start date not null,period_end date not null,
 quantity numeric not null default 0,metadata jsonb not null default '{}',updated_at timestamptz not null default now(),
 primary key(tenant_id,meter_key,period_start,period_end)
);
create table if not exists billing_ledger(
 id text primary key,tenant_id text not null,kind text not null,status text not null,amount_minor bigint not null,currency text not null default 'GBP',
 external_id text,description text,period_start timestamptz,period_end timestamptz,created_at timestamptz not null default now(),paid_at timestamptz
);
create table if not exists custom_domains(
 id text primary key,tenant_id text not null,hostname text not null unique,status text not null default 'PENDING',
 verification_token text not null,target text,verified_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists customer_api_keys(
 id text primary key,tenant_id text not null,name text not null,key_hash text not null unique,prefix text not null,scopes jsonb not null default '[]',
 status text not null default 'ACTIVE',expires_at timestamptz,last_used_at timestamptz,created_by text,created_at timestamptz not null default now()
);
create table if not exists support_cases(
 id text primary key,tenant_id text not null,severity text not null,status text not null default 'OPEN',subject text not null,body text,
 owner text,created_by text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),closed_at timestamptz
);
create table if not exists sla_policies(
 tenant_id text not null,service_tier text not null,availability_target numeric not null default 99.9,
 response_minutes_p1 int not null default 60,response_minutes_p2 int not null default 240,resolution_target jsonb not null default '{}',
 support_hours jsonb not null default '{}',updated_at timestamptz not null default now(),primary key(tenant_id,service_tier)
);
create table if not exists sla_events(
 id text primary key,tenant_id text not null,case_id text,severity text not null,started_at timestamptz not null,acknowledged_at timestamptz,
 resolved_at timestamptz,breached boolean not null default false,metadata jsonb not null default '{}'
);
create table if not exists regional_deployments(
 id text primary key,tenant_id text not null,region text not null,status text not null default 'REQUESTED',
 data_residency text not null,compute_profile jsonb not null default '{}',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,region)
);
