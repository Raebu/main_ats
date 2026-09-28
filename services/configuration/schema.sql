create table if not exists tenant_config(
 tenant_id text not null,key text not null,value jsonb not null,updated_at timestamptz not null default now(),
 primary key(tenant_id,key)
);
create table if not exists scoped_config(
 id text primary key,tenant_id text not null,scope_type text not null,scope_id text not null,key text not null,
 value jsonb not null,version int not null default 1,updated_by text,updated_at timestamptz not null default now(),
 unique(tenant_id,scope_type,scope_id,key)
);
create table if not exists config_history(
 id text primary key,tenant_id text not null,scope_type text not null,scope_id text not null,key text not null,
 version int not null,value jsonb not null,changed_by text,changed_at timestamptz not null default now(),
 rollback_from_version int
);
alter table config_history add column if not exists rollback_from_version int;
create table if not exists admin_registry(
 id text primary key,tenant_id text not null,category text not null,key text not null,label text not null,
 config jsonb not null default '{}',active boolean not null default true,version int not null default 1,
 updated_by text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,category,key)
);
create index if not exists admin_registry_category on admin_registry(tenant_id,category,active,label);
