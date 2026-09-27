create table if not exists interviews(id text primary key,tenant_id text not null,application_id text not null,round int not null default 1,status text not null default 'REQUESTED',starts_at timestamptz,ends_at timestamptz,meeting_url text,participants jsonb not null default '[]',created_at timestamptz not null default now());create table if not exists interview_feedback(id text primary key,tenant_id text not null,interview_id text not null,reviewer_id text not null,scorecard jsonb not null,notes text,created_at timestamptz not null default now());
create table if not exists outbox_events(id text primary key,event_type text not null,payload jsonb not null,created_at timestamptz not null default now(),published_at timestamptz,retry_count int not null default 0,last_error text);

create table if not exists competency_frameworks(
 id text primary key,tenant_id text not null,name text not null,description text,competencies jsonb not null default '[]',
 active boolean not null default true,created_at timestamptz not null default now()
);
create table if not exists interview_templates(
 id text primary key,tenant_id text not null,name text not null,interview_type text not null,
 competency_framework_id text,questions jsonb not null default '[]',score_dimensions jsonb not null default '[]',
 instructions text,version int not null default 1,active boolean not null default true,created_at timestamptz not null default now()
);
alter table interviews add column if not exists template_id text;
alter table interviews add column if not exists candidate_questions jsonb not null default '[]';
alter table interviews add column if not exists consensus jsonb not null default '{}';
create table if not exists interviewer_declarations(
 id text primary key,tenant_id text not null,interview_id text not null,reviewer_id text not null,
 conflict_declared boolean not null default false,conflict_detail text,training_acknowledged boolean not null default false,
 created_at timestamptz not null default now(),unique(tenant_id,interview_id,reviewer_id)
);

alter table interviews add column if not exists questions_snapshot jsonb not null default '[]';
alter table interviews add column if not exists score_dimensions_snapshot jsonb not null default '[]';
alter table interviews add column if not exists training_prompt text;
alter table interviews add column if not exists feedback_due_at timestamptz;
alter table interviews add column if not exists consensus_opened_at timestamptz;
alter table interviews add column if not exists reschedule_status text;
alter table interviews add column if not exists reschedule_request jsonb not null default '{}';
alter table interview_feedback add column if not exists submitted_at timestamptz not null default now();
create table if not exists interview_reminders(
 id text primary key,tenant_id text not null,interview_id text not null,reviewer_id text not null,kind text not null,
 scheduled_for timestamptz not null,status text not null default 'PENDING',sent_at timestamptz,
 unique(tenant_id,interview_id,reviewer_id,kind)
);
create index if not exists interview_reminders_due on interview_reminders(status,scheduled_for);

create unique index if not exists interview_feedback_unique on interview_feedback(tenant_id,interview_id,reviewer_id);
