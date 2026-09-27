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
