create table if not exists users(
 id text primary key,
 tenant_id text not null,
 email text not null,
 display_name text not null,
 password_hash text,
 status text not null default 'ACTIVE',
 created_at timestamptz not null default now(),
 last_login_at timestamptz,
 unique(tenant_id,email)
);
create table if not exists memberships(
 user_id text not null,
 tenant_id text not null,
 organisation_id text not null default 'org_raeburn_group',
 role text not null,
 permissions jsonb not null default '[]',
 primary key(user_id,tenant_id,organisation_id)
);

alter table users add column if not exists password_hash text;
alter table users add column if not exists last_login_at timestamptz;

create table if not exists auth_sessions(
 id text primary key,tenant_id text not null,user_id text not null,created_at timestamptz not null default now(),
 expires_at timestamptz not null,revoked_at timestamptz,last_seen_at timestamptz,user_agent_hash text,ip_hash text
);
create index if not exists auth_sessions_user on auth_sessions(tenant_id,user_id,revoked_at);
create table if not exists mfa_methods(
 id text primary key,tenant_id text not null,user_id text not null,method text not null,secret_encrypted text,
 enabled boolean not null default false,created_at timestamptz not null default now(),verified_at timestamptz,
 unique(tenant_id,user_id,method)
);
create table if not exists identity_providers(
 id text primary key,tenant_id text not null,provider text not null,status text not null default 'DISABLED',
 config jsonb not null default '{}',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,provider)
);
