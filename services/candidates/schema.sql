create table if not exists candidates(
 id text primary key,tenant_id text not null,email text not null,name text not null,telephone text,location text,linkedin text,portfolio text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(tenant_id,email)
);
create index if not exists candidate_lookup on candidates(tenant_id,email);
create table if not exists outbox_events(id text primary key,event_type text not null,payload jsonb not null,created_at timestamptz not null default now(),published_at timestamptz,retry_count int not null default 0,last_error text);