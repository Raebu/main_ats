-- Stage 12 repair: promote the idempotent campaigns core schema into the immutable migration chain.
-- Intentionally ordered before the existing historical migrations.
create table if not exists campaigns(id text primary key,tenant_id text not null,name text not null,slug text not null,status text not null default 'DRAFT',metadata jsonb not null default '{}',created_at timestamptz not null default now(),unique(tenant_id,slug));
alter table campaigns add column if not exists budget numeric;
alter table campaigns add column if not exists currency text default 'GBP';
alter table campaigns add column if not exists audience jsonb not null default '{}';
alter table campaigns add column if not exists starts_at timestamptz;
alter table campaigns add column if not exists ends_at timestamptz;
alter table campaigns add column if not exists campaign_type text not null default 'GENERAL';
alter table campaigns add column if not exists objective text;
alter table campaigns add column if not exists landing jsonb not null default '{}';
create table if not exists campaign_variants(
 id text primary key,tenant_id text not null,campaign_id text not null,name text not null,creative jsonb not null default '{}',
 weight int not null default 50,active boolean not null default true,created_at timestamptz not null default now()
);
create table if not exists campaign_links(
 id text primary key,tenant_id text not null,campaign_id text not null,variant_id text,slug text not null,
 destination text not null,utm jsonb not null default '{}',qr_payload text,created_at timestamptz not null default now(),
 unique(tenant_id,slug)
);
create table if not exists campaign_experiments(
 id text primary key,tenant_id text not null,campaign_id text not null,name text not null,experiment_type text not null,
 status text not null default 'DRAFT',primary_metric text not null default 'APPLICATION',configuration jsonb not null default '{}',
 winner_variant_id text,started_at timestamptz,ended_at timestamptz,created_at timestamptz not null default now()
);
create table if not exists campaign_events(
 id text primary key,tenant_id text not null,campaign_id text not null,variant_id text,job_id text,visitor_id text,
 event_type text not null,value numeric,metadata jsonb not null default '{}',occurred_at timestamptz not null default now()
);
create index if not exists campaign_events_lookup on campaign_events(tenant_id,campaign_id,event_type,occurred_at);
create table if not exists campaign_signups(
 id text primary key,tenant_id text not null,campaign_id text,email text not null,name text,status text not null default 'SUBSCRIBED',
 consent_version text not null,source text not null default 'CAMPAIGN',metadata jsonb not null default '{}',
 created_at timestamptz not null default now(),unsubscribed_at timestamptz,unique(tenant_id,email,campaign_id)
);
