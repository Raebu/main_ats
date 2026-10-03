-- Stage 12 repair for feature-flags schema prerequisites omitted from the original migration chain.
-- Intentionally ordered before the existing Stage 9 and Stage 11 migrations.
create table if not exists feature_flags(
  tenant_id text not null,
  key text not null,
  enabled boolean not null default false,
  config jsonb not null default '{}',
  rollout_percentage int not null default 100,
  target_organisations jsonb not null default '[]',
  target_users jsonb not null default '[]',
  expires_at timestamptz,
  kill_switch boolean not null default false,
  experiment_key text,
  evaluation_count bigint not null default 0,
  enabled_count bigint not null default 0,
  last_evaluated_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(tenant_id,key)
);

create table if not exists feature_flag_history(
  id text primary key,
  tenant_id text not null,
  key text not null,
  snapshot jsonb not null,
  changed_by text,
  changed_at timestamptz not null default now()
);
