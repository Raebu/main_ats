create table if not exists publications(
 id text primary key,tenant_id text not null,job_id text not null,destination text not null,status text not null,
 external_reference text,last_error text,last_attempt_at timestamptz,last_success_at timestamptz,
 attempt_count int not null default 0,next_attempt_at timestamptz,provider_config jsonb not null default '{}',
 job_snapshot jsonb not null default '{}',cost_pence int not null default 0,currency text not null default 'GBP',
 rejection_reason text,receipt jsonb not null default '{}',updated_at timestamptz not null default now(),
 unique(tenant_id,job_id,destination)
);
create table if not exists publication_attempts(
 id text primary key,tenant_id text not null,publication_id text not null,job_id text not null,destination text not null,
 action text not null,status text not null,attempt_no int not null,response jsonb not null default '{}',
 error text,started_at timestamptz not null default now(),completed_at timestamptz
);
create index if not exists publication_attempts_lookup on publication_attempts(tenant_id,job_id,destination,started_at desc);
create table if not exists publication_dlq(
 id text primary key,tenant_id text not null,publication_id text not null,job_id text not null,destination text not null,
 payload jsonb not null default '{}',reason text not null,attempts int not null,created_at timestamptz not null default now(),
 replayed_at timestamptz
);
create table if not exists provider_settings(
 id text primary key,tenant_id text not null,provider text not null,enabled boolean not null default false,
 cost_pence int not null default 0,currency text not null default 'GBP',mapping jsonb not null default '{}',
 copy_overrides jsonb not null default '{}',max_attempts int not null default 5,base_retry_seconds int not null default 60,
 updated_at timestamptz not null default now(),unique(tenant_id,provider)
);
create table if not exists processed_events(event_id text primary key,processed_at timestamptz not null default now());
