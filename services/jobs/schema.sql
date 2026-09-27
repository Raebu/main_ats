create table if not exists jobs(
 id text primary key,tenant_id text not null,reference text not null,slug text not null,title text not null,
 hiring_organisation_id text not null,operating_organisation_id text,department text,location text not null,
 workplace_type text not null,employment_type text not null,engagement text,summary text not null,
 description text not null,requirements text not null,benefits text,status text not null default 'DRAFT',
 audiences jsonb not null default '[]',date_posted timestamptz,valid_through timestamptz,version int not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,reference),unique(tenant_id,slug)
);
create index if not exists jobs_tenant_status on jobs(tenant_id,status);
create table if not exists outbox_events(id text primary key,event_type text not null,payload jsonb not null,created_at timestamptz not null default now(),published_at timestamptz,retry_count int not null default 0,last_error text);
alter table jobs add column if not exists requisition_id text;
alter table jobs add column if not exists visibility text not null default 'EXTERNAL';
alter table jobs add column if not exists confidential boolean not null default false;
alter table jobs add column if not exists evergreen boolean not null default false;
alter table jobs add column if not exists recurring_rule text;
alter table jobs add column if not exists openings int not null default 1;
alter table jobs add column if not exists filled_openings int not null default 0;
alter table jobs add column if not exists salary_min numeric;
alter table jobs add column if not exists salary_max numeric;
alter table jobs add column if not exists salary_currency text default 'GBP';
alter table jobs add column if not exists salary_period text default 'YEAR';
alter table jobs add column if not exists publication_checklist jsonb not null default '{}';

create table if not exists job_templates(
 id text primary key,tenant_id text not null,name text not null,organisation_id text,department text,
 template jsonb not null,version int not null default 1,active boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists requisitions(
 id text primary key,tenant_id text not null,reference text not null,title text not null,organisation_id text not null,department text,
 requested_openings int not null default 1,approved_openings int not null default 0,filled_openings int not null default 0,
 budget_min numeric,budget_max numeric,currency text default 'GBP',target_start_date date,status text not null default 'DRAFT',
 requested_by text,approved_by text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,reference)
);
create table if not exists job_versions(
 id text primary key,tenant_id text not null,job_id text not null,version int not null,snapshot jsonb not null,
 created_by text,created_at timestamptz not null default now(),unique(tenant_id,job_id,version)
);
create table if not exists job_approvals(
 id text primary key,tenant_id text not null,job_id text not null,approval_type text not null,
 status text not null default 'PENDING',requested_from text,decision_by text,decision_note text,
 requested_at timestamptz not null default now(),decided_at timestamptz,
 unique(tenant_id,job_id,approval_type)
);
create table if not exists salary_bands(
 id text primary key,tenant_id text not null,organisation_id text,department text,role_family text,level text,
 min_amount numeric,max_amount numeric,currency text not null default 'GBP',period text not null default 'YEAR',
 active boolean not null default true,created_at timestamptz not null default now()
);

create table if not exists hiring_plans(
 id text primary key,tenant_id text not null,organisation_id text not null,name text not null,period_start date,period_end date,
 budget numeric,currency text not null default 'GBP',status text not null default 'DRAFT',created_by text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists hiring_plan_items(
 id text primary key,tenant_id text not null,hiring_plan_id text not null,department text,title text not null,
 planned_openings int not null default 1,approved_openings int not null default 0,forecast_date date,
 estimated_cost numeric,dependencies jsonb not null default '[]',requisition_id text,actual_hires int not null default 0
);
create table if not exists workforce_scenarios(
 id text primary key,tenant_id text not null,hiring_plan_id text,name text not null,assumptions jsonb not null default '{}',
 results jsonb not null default '{}',created_at timestamptz not null default now()
);

alter table jobs add column if not exists hiring_manager_user_id text;
create index if not exists jobs_hiring_manager on jobs(tenant_id,hiring_manager_user_id,status);


create table if not exists workforce_capacity(
 id text primary key,tenant_id text not null,organisation_id text not null,department text,period_start date,period_end date,
 current_headcount int not null default 0,target_headcount int not null default 0,planned_hires int not null default 0,planned_exits int not null default 0,
 annualised_cost numeric,currency text not null default 'GBP',notes text,created_at timestamptz not null default now()
);
create index if not exists workforce_capacity_scope on workforce_capacity(tenant_id,organisation_id,department,period_start);
