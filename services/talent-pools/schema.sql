create table if not exists talent_pools(id text primary key,tenant_id text not null,name text not null,description text,created_at timestamptz not null default now(),unique(tenant_id,name));create table if not exists talent_pool_members(pool_id text not null,candidate_id text not null,tenant_id text not null,added_at timestamptz not null default now(),primary key(tenant_id,pool_id,candidate_id));
create table if not exists outbox_events(id text primary key,event_type text not null,payload jsonb not null,created_at timestamptz not null default now(),published_at timestamptz,retry_count int not null default 0,last_error text);

create table if not exists talent_pool_history(
 id text primary key,tenant_id text not null,pool_id text not null,candidate_id text not null,action text not null,
 actor text,occurred_at timestamptz not null default now()
);
create index if not exists talent_pool_history_candidate on talent_pool_history(tenant_id,candidate_id,occurred_at desc);

alter table talent_pools add column if not exists criteria jsonb not null default '{}';
alter table talent_pools add column if not exists nurture_enabled boolean not null default false;
alter table talent_pools add column if not exists reengage_after_days int not null default 90;
alter table talent_pool_members add column if not exists last_engaged_at timestamptz;
alter table talent_pool_members add column if not exists engagement_score numeric not null default 0;
alter table talent_pool_members add column if not exists suggested boolean not null default false;
alter table talent_pool_members add column if not exists suggestion_evidence jsonb not null default '{}';

create table if not exists pool_suggestions(
 id text primary key,tenant_id text not null,pool_id text not null,candidate_id text not null,
 score numeric not null default 0,evidence jsonb not null default '{}',status text not null default 'SUGGESTED',
 created_at timestamptz not null default now(),reviewed_at timestamptz,reviewed_by text,
 unique(tenant_id,pool_id,candidate_id)
);
create index if not exists pool_suggestions_status on pool_suggestions(tenant_id,status,score desc);

create table if not exists nurture_actions(
 id text primary key,tenant_id text not null,pool_id text,candidate_id text not null,
 action_type text not null,status text not null default 'DUE',reason text,
 due_at timestamptz not null default now(),completed_at timestamptz,created_at timestamptz not null default now()
);
create index if not exists nurture_due on nurture_actions(tenant_id,status,due_at);

create table if not exists pool_health_snapshots(
 id text primary key,tenant_id text not null,pool_id text not null,
 member_count int not null,fresh_count int not null,engaged_count int not null,stale_count int not null,
 average_engagement numeric not null default 0,health_score numeric not null default 0,
 created_at timestamptz not null default now()
);
create index if not exists pool_health_history on pool_health_snapshots(tenant_id,pool_id,created_at desc);
