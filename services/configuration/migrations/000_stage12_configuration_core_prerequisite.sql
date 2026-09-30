-- Stage 12 repair for configuration schema prerequisites omitted from the original migration chain.
-- This migration is intentionally ordered before the existing Stage 9 and Stage 11 migrations.
create table if not exists tenant_config(
  tenant_id text not null,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key(tenant_id,key)
);

create table if not exists scoped_config(
  id text primary key,
  tenant_id text not null,
  scope_type text not null,
  scope_id text not null,
  key text not null,
  value jsonb not null,
  version int not null default 1,
  updated_by text,
  updated_at timestamptz not null default now(),
  unique(tenant_id,scope_type,scope_id,key)
);

create table if not exists config_history(
  id text primary key,
  tenant_id text not null,
  scope_type text not null,
  scope_id text not null,
  key text not null,
  version int not null,
  value jsonb not null,
  changed_by text,
  changed_at timestamptz not null default now(),
  rollback_from_version int
);
