create table if not exists assessments(id text primary key,tenant_id text not null,application_id text not null,type text not null,title text not null,instructions text,status text not null default 'CREATED',evidence jsonb not null default '{}',created_at timestamptz not null default now());
create table if not exists assessment_templates(
 id text primary key,tenant_id text not null,name text not null,type text not null,instructions text,
 rubric jsonb not null default '{}',accessibility_options jsonb not null default '{}',version int not null default 1,
 active boolean not null default true,created_at timestamptz not null default now()
);
alter table assessments add column if not exists template_id text;
alter table assessments add column if not exists template_version int;
alter table assessments add column if not exists due_at timestamptz;
alter table assessments add column if not exists blind_review boolean not null default false;
alter table assessments add column if not exists accessibility_adjustments jsonb not null default '{}';
create table if not exists assessment_submissions(
 id text primary key,tenant_id text not null,assessment_id text not null,submitted_at timestamptz not null default now(),
 content jsonb not null default '{}',document_ids jsonb not null default '[]',integrity jsonb not null default '{}'
);
create table if not exists assessment_reviews(
 id text primary key,tenant_id text not null,assessment_id text not null,reviewer_id text not null,
 scores jsonb not null default '{}',feedback text,created_at timestamptz not null default now(),
 unique(tenant_id,assessment_id,reviewer_id)
);

alter table assessments add column if not exists extension_status text;
alter table assessments add column if not exists extension_request jsonb not null default '{}';
alter table assessments add column if not exists feedback_visible_at timestamptz;
alter table assessments add column if not exists candidate_feedback text;
alter table assessments add column if not exists updated_at timestamptz not null default now();
create table if not exists assessment_template_versions(
 id text primary key,tenant_id text not null,template_id text not null,version int not null,snapshot jsonb not null,
 created_by text,created_at timestamptz not null default now(),unique(tenant_id,template_id,version)
);
create table if not exists assessment_extensions(
 id text primary key,tenant_id text not null,assessment_id text not null,requested_due_at timestamptz,reason text not null,
 status text not null default 'REQUESTED',decision_by text,decision_note text,created_at timestamptz not null default now(),decided_at timestamptz
);
