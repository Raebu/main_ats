create table if not exists new_hires(
 id text primary key,tenant_id text not null,application_id text not null,candidate_id text,job_id text,
 classification text not null default 'EMPLOYEE',start_date date,status text not null default 'PREBOARDING',
 source_hire jsonb not null default '{}',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,application_id)
);
create table if not exists onboarding_tasks(
 id text primary key,tenant_id text not null,new_hire_id text not null,category text not null,title text not null,
 owner text,status text not null default 'OPEN',due_at timestamptz,completed_at timestamptz,metadata jsonb not null default '{}',
 created_at timestamptz not null default now()
);
create table if not exists onboarding_handoffs(
 id text primary key,tenant_id text not null,new_hire_id text not null,destination text not null,status text not null default 'PENDING',
 external_reference text,last_error text,payload jsonb not null default '{}',created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists processed_events(event_id text primary key,processed_at timestamptz not null default now());
create table if not exists outbox_events(id text primary key,event_type text not null,payload jsonb not null,created_at timestamptz not null default now(),published_at timestamptz,retry_count int not null default 0,last_error text);
alter table new_hires add column if not exists day_rate numeric;
alter table new_hires add column if not exists contract_end_date date;
alter table new_hires add column if not exists ir35_status text;
alter table new_hires add column if not exists supplier_details jsonb not null default '{}';
