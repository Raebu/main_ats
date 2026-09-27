create table if not exists talent_pools(id text primary key,tenant_id text not null,name text not null,description text,created_at timestamptz not null default now(),unique(tenant_id,name));create table if not exists talent_pool_members(pool_id text not null,candidate_id text not null,tenant_id text not null,added_at timestamptz not null default now(),primary key(tenant_id,pool_id,candidate_id));
create table if not exists outbox_events(id text primary key,event_type text not null,payload jsonb not null,created_at timestamptz not null default now(),published_at timestamptz,retry_count int not null default 0,last_error text);

create table if not exists talent_pool_history(
 id text primary key,tenant_id text not null,pool_id text not null,candidate_id text not null,action text not null,
 actor text,occurred_at timestamptz not null default now()
);
create index if not exists talent_pool_history_candidate on talent_pool_history(tenant_id,candidate_id,occurred_at desc);
