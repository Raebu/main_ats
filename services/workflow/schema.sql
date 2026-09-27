create table if not exists application_workflows(application_id text not null,tenant_id text not null,stage text not null,updated_at timestamptz not null default now(),primary key(tenant_id,application_id));
create table if not exists stage_history(id text primary key,tenant_id text not null,application_id text not null,from_stage text,to_stage text not null,actor text,occurred_at timestamptz not null default now());
create table if not exists outbox_events(id text primary key,event_type text not null,payload jsonb not null,created_at timestamptz not null default now(),published_at timestamptz,retry_count int not null default 0,last_error text);
create table if not exists processed_events(event_id text primary key,processed_at timestamptz not null default now());

create table if not exists workflow_notes(
 id text primary key,tenant_id text not null,application_id text not null,author_id text,body text not null,
 pinned boolean not null default false,mentions jsonb not null default '[]',created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists workflow_tasks(
 id text primary key,tenant_id text not null,application_id text,job_id text,candidate_id text,
 title text not null,description text,assignee_id text,status text not null default 'OPEN',priority text not null default 'NORMAL',
 due_at timestamptz,completed_at timestamptz,created_by text,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists workflow_tasks_attention on workflow_tasks(tenant_id,status,due_at);
create table if not exists saved_views(
 id text primary key,tenant_id text not null,user_id text not null,name text not null,resource_type text not null,
 filters jsonb not null default '{}',sort jsonb not null default '{}',is_default boolean not null default false,created_at timestamptz not null default now()
);
create table if not exists favourites(
 tenant_id text not null,user_id text not null,resource_type text not null,resource_id text not null,created_at timestamptz not null default now(),
 primary key(tenant_id,user_id,resource_type,resource_id)
);
create table if not exists application_slas(
 tenant_id text not null,application_id text not null,stage text not null,due_at timestamptz not null,breached_at timestamptz,
 primary key(tenant_id,application_id,stage)
);
