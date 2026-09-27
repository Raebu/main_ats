create table if not exists integration_connections(id text primary key,tenant_id text not null,provider text not null,status text not null default 'DISCONNECTED',config jsonb not null default '{}',updated_at timestamptz not null default now(),unique(tenant_id,provider));
create table if not exists integration_actions(
 id text primary key,tenant_id text not null,provider text not null,action text not null,status text not null,
 request_meta jsonb not null default '{}',response_meta jsonb not null default '{}',last_error text,
 correlation_id text,created_at timestamptz not null default now(),completed_at timestamptz
);
