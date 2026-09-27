create table if not exists scheduled_actions(
 id text primary key,tenant_id text not null,action_type text not null,run_at timestamptz not null,payload jsonb not null,
 status text not null default 'PENDING',recurrence text,timezone text not null default 'UTC',
 max_runs int,runs_completed int not null default 0,last_error text,created_at timestamptz not null default now(),executed_at timestamptz
);
alter table scheduled_actions add column if not exists recurrence text;
alter table scheduled_actions add column if not exists timezone text not null default 'UTC';
alter table scheduled_actions add column if not exists max_runs int;
alter table scheduled_actions add column if not exists runs_completed int not null default 0;
alter table scheduled_actions add column if not exists last_error text;
create index if not exists scheduled_due on scheduled_actions(status,run_at);