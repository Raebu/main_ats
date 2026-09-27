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


-- Stage 8 security controls
alter table users add column if not exists password_changed_at timestamptz;
alter table users add column if not exists failed_login_count int not null default 0;
alter table users add column if not exists locked_until timestamptz;

create table if not exists refresh_tokens(
 id text primary key,tenant_id text not null,user_id text not null,session_id text not null,
 token_hash text not null unique,created_at timestamptz not null default now(),expires_at timestamptz not null,
 rotated_from_id text,revoked_at timestamptz,used_at timestamptz
);
create index if not exists refresh_tokens_session on refresh_tokens(tenant_id,session_id,revoked_at);

create table if not exists password_reset_tokens(
 id text primary key,tenant_id text not null,user_id text not null,token_hash text not null unique,
 expires_at timestamptz not null,used_at timestamptz,created_at timestamptz not null default now()
);

create table if not exists auth_security_events(
 id text primary key,tenant_id text not null,user_id text,email text,event_type text not null,
 ip_hash text,user_agent_hash text,detail jsonb not null default '{}',created_at timestamptz not null default now()
);
create index if not exists auth_security_events_lookup on auth_security_events(tenant_id,email,created_at desc);

create table if not exists webauthn_challenges(
 id text primary key,tenant_id text not null,user_id text,purpose text not null,challenge text not null,
 metadata jsonb not null default '{}',expires_at timestamptz not null,used_at timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists webauthn_credentials(
 id text primary key,tenant_id text not null,user_id text not null,credential_id text not null,
 public_key text not null,counter bigint not null default 0,transports jsonb not null default '[]',
 device_type text,backed_up boolean,created_at timestamptz not null default now(),last_used_at timestamptz,
 unique(tenant_id,credential_id)
);

create table if not exists oidc_states(
 id text primary key,tenant_id text not null,provider text not null,state_hash text not null unique,
 nonce text not null,code_verifier text not null,return_to text,expires_at timestamptz not null,
 created_at timestamptz not null default now()
);

create table if not exists service_identities(
 id text primary key,tenant_id text not null,name text not null,status text not null default 'ACTIVE',
 scopes jsonb not null default '[]',created_at timestamptz not null default now(),unique(tenant_id,name)
);
create table if not exists service_credentials(
 id text primary key,tenant_id text not null,service_id text not null,key_hash text not null unique,
 expires_at timestamptz,revoked_at timestamptz,created_at timestamptz not null default now(),last_used_at timestamptz
);

create table if not exists bootstrap_state(
 tenant_id text primary key,disabled_at timestamptz,disabled_by text,created_at timestamptz not null default now()
);
