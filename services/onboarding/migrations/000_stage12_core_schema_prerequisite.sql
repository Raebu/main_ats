-- Stage 12 repair: promote the idempotent onboarding core schema into the immutable migration chain.
-- Intentionally ordered before the existing historical migrations.
create table if not exists new_hires(
 id text primary key,tenant_id text not null,application_id text not null,candidate_id text,job_id text,
 classification text not null default 'EMPLOYEE',start_date date,status text not null default 'PREBOARDING',
 source_hire jsonb not null default '{}',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,application_id)
);
create table if not exists onboarding_tasks(id text primary key,tenant_id text not null,new_hire_id text not null,category text not null,title text not null,owner text,status text not null default 'OPEN',due_at timestamptz,completed_at timestamptz,metadata jsonb not null default '{}',created_at timestamptz not null default now());
create table if not exists onboarding_handoffs(id text primary key,tenant_id text not null,new_hire_id text not null,destination text not null,status text not null default 'PENDING',external_reference text,last_error text,payload jsonb not null default '{}',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists processed_events(event_id text primary key,processed_at timestamptz not null default now());
create table if not exists outbox_events(id text primary key,event_type text not null,payload jsonb not null,created_at timestamptz not null default now(),published_at timestamptz,retry_count int not null default 0,last_error text);
alter table new_hires add column if not exists day_rate numeric;
alter table new_hires add column if not exists contract_end_date date;
alter table new_hires add column if not exists ir35_status text;
alter table new_hires add column if not exists supplier_details jsonb not null default '{}';
alter table new_hires add column if not exists contractor_stage text not null default 'PRE_ENGAGEMENT';
alter table new_hires add column if not exists contractor_pool_id text;
create table if not exists contractor_extensions(
 id text primary key,tenant_id text not null,new_hire_id text not null,previous_end_date date,new_end_date date not null,
 previous_day_rate numeric,new_day_rate numeric,reason text,status text not null default 'APPROVED',approved_by text,
 created_at timestamptz not null default now()
);
create table if not exists contractor_reminders(
 id text primary key,tenant_id text not null,new_hire_id text not null,reminder_type text not null,due_at timestamptz not null,
 status text not null default 'PENDING',created_at timestamptz not null default now(),completed_at timestamptz
);
create index if not exists contractor_reminders_due on contractor_reminders(tenant_id,status,due_at);
