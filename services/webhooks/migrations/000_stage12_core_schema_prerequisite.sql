-- Stage 12 repair: promote the idempotent webhooks core schema into the immutable migration chain.
-- Intentionally ordered before the existing historical migrations.
create table if not exists webhook_receipts(id text primary key,tenant_id text not null,provider text not null,external_id text,signature_valid boolean not null,headers jsonb not null,payload jsonb not null,received_at timestamptz not null default now(),unique(provider,external_id));
create table if not exists webhook_subscriptions(
 id text primary key,tenant_id text not null,name text not null,url text not null,events jsonb not null default '[]',
 signing_secret_ref text,status text not null default 'ACTIVE',created_by text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists webhook_deliveries(
 id text primary key,tenant_id text not null,subscription_id text not null,event_type text not null,event_id text,
 status text not null default 'PENDING',attempt int not null default 0,response_status int,last_error text,
 created_at timestamptz not null default now(),delivered_at timestamptz
);
create table if not exists api_clients(
 id text primary key,tenant_id text not null,name text not null,key_hash text not null unique,scopes jsonb not null default '[]',
 status text not null default 'ACTIVE',expires_at timestamptz,created_by text,
 created_at timestamptz not null default now(),last_used_at timestamptz
);
