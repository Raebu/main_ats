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

alter table workflow_notes add column if not exists parent_note_id text;
alter table workflow_notes add column if not exists note_type text not null default 'COMMENT';
alter table workflow_notes add column if not exists resolved_at timestamptz;

create table if not exists decision_summaries(
 id text primary key,tenant_id text not null,application_id text not null,decision text not null,summary text not null,
 evidence jsonb not null default '[]',created_by text,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists decision_summaries_application on decision_summaries(tenant_id,application_id,created_at desc);

create table if not exists recent_views(
 tenant_id text not null,user_id text not null,resource_type text not null,resource_id text not null,
 title text,href text,viewed_at timestamptz not null default now(),
 primary key(tenant_id,user_id,resource_type,resource_id)
);
create index if not exists recent_views_user on recent_views(tenant_id,user_id,viewed_at desc);

create table if not exists user_preferences(
 tenant_id text not null,user_id text not null,preferences jsonb not null default '{}',updated_at timestamptz not null default now(),
 primary key(tenant_id,user_id)
);
create table if not exists dashboard_widgets(
 tenant_id text not null,user_id text not null,widget_key text not null,enabled boolean not null default true,
 position int not null default 0,config jsonb not null default '{}',updated_at timestamptz not null default now(),
 primary key(tenant_id,user_id,widget_key)
);
create table if not exists follow_up_rules(
 id text primary key,tenant_id text not null,name text not null,stage text,after_hours int not null,
 title_template text not null,priority text not null default 'NORMAL',enabled boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists escalation_rules(
 id text primary key,tenant_id text not null,name text not null,stage text,after_hours int not null,
 priority text not null default 'HIGH',enabled boolean not null default true,created_at timestamptz not null default now()
);
create table if not exists workflow_automation_runs(
 id text primary key,tenant_id text not null,rule_type text not null,rule_id text not null,application_id text not null,
 result text not null,created_at timestamptz not null default now(),
 unique(tenant_id,rule_type,rule_id,application_id)
);


-- Stage 8 decision evidence and fairness controls
create table if not exists decision_reason_taxonomy(
 id text primary key,tenant_id text not null,code text not null,label text not null,decision_type text not null,
 stages jsonb not null default '[]',requires_evidence boolean not null default true,active boolean not null default true,
 guidance text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,code)
);
create table if not exists decision_evidence(
 id text primary key,tenant_id text not null,application_id text not null,from_stage text,to_stage text not null,
 reason_code text not null,rationale text not null,evidence jsonb not null default '[]',actor text,
 created_at timestamptz not null default now()
);
create index if not exists decision_evidence_application on decision_evidence(tenant_id,application_id,created_at desc);

create table if not exists blind_review_policies(
 id text primary key,tenant_id text not null,scope_type text not null default 'TENANT',scope_id text not null,
 stages jsonb not null default '[]',hide_fields jsonb not null default '["name","email","telephone","photo","linkedin"]',
 enabled boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,scope_type,scope_id)
);
create table if not exists consistency_audits(
 id text primary key,tenant_id text not null,scope jsonb not null default '{}',period_start timestamptz,period_end timestamptz,
 findings jsonb not null default '{}',reviewed_by text,status text not null default 'OPEN',
 created_at timestamptz not null default now(),reviewed_at timestamptz
);
create table if not exists fairness_monitor_runs(
 id text primary key,tenant_id text not null,metric text not null,cohorts jsonb not null,minimum_group_size int not null default 5,
 findings jsonb not null default '{}',methodology text not null,created_by text,created_at timestamptz not null default now()
);
