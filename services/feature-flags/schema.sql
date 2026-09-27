create table if not exists feature_flags(
 tenant_id text not null,key text not null,enabled boolean not null default false,config jsonb not null default '{}',
 rollout_percentage int not null default 100,target_organisations jsonb not null default '[]',
 target_users jsonb not null default '[]',expires_at timestamptz,kill_switch boolean not null default false,
 updated_at timestamptz not null default now(),primary key(tenant_id,key)
);
alter table feature_flags add column if not exists rollout_percentage int not null default 100;
alter table feature_flags add column if not exists target_organisations jsonb not null default '[]';
alter table feature_flags add column if not exists target_users jsonb not null default '[]';
alter table feature_flags add column if not exists expires_at timestamptz;
alter table feature_flags add column if not exists kill_switch boolean not null default false;
create table if not exists feature_flag_history(
 id text primary key,tenant_id text not null,key text not null,snapshot jsonb not null,changed_by text,changed_at timestamptz not null default now()
);