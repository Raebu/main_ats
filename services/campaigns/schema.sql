create table if not exists campaigns(id text primary key,tenant_id text not null,name text not null,slug text not null,status text not null default 'DRAFT',metadata jsonb not null default '{}',created_at timestamptz not null default now(),unique(tenant_id,slug));
alter table campaigns add column if not exists budget numeric;
alter table campaigns add column if not exists currency text default 'GBP';
alter table campaigns add column if not exists audience jsonb not null default '{}';
alter table campaigns add column if not exists starts_at timestamptz;
alter table campaigns add column if not exists ends_at timestamptz;
create table if not exists campaign_variants(
 id text primary key,tenant_id text not null,campaign_id text not null,name text not null,creative jsonb not null default '{}',
 weight int not null default 50,active boolean not null default true,created_at timestamptz not null default now()
);
create table if not exists campaign_links(
 id text primary key,tenant_id text not null,campaign_id text not null,variant_id text,slug text not null,
 destination text not null,utm jsonb not null default '{}',qr_payload text,created_at timestamptz not null default now(),
 unique(tenant_id,slug)
);
