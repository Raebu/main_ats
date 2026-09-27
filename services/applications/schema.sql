create table if not exists applications(
 id text primary key,tenant_id text not null,job_id text not null,candidate_id text not null,
 right_to_work text,availability text,cover_note text,privacy_notice_version text not null,privacy_accepted_at timestamptz not null,
 attribution jsonb not null default '{}',answers jsonb not null default '[]',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,job_id,candidate_id)
);
create index if not exists applications_job on applications(tenant_id,job_id);
create table if not exists outbox_events(id text primary key,event_type text not null,payload jsonb not null,created_at timestamptz not null default now(),published_at timestamptz,retry_count int not null default 0,last_error text);
create table if not exists candidate_portal_sessions(
 id text primary key,tenant_id text not null,application_id text not null,candidate_id text not null,
 token_hash text not null unique,expires_at timestamptz not null,revoked_at timestamptz,
 created_at timestamptz not null default now(),last_used_at timestamptz
);
create index if not exists portal_application_idx on candidate_portal_sessions(tenant_id,application_id);

create table if not exists candidate_experience_preferences(
 tenant_id text not null,candidate_id text not null,locale text not null default 'en-GB',
 accessibility_preferences jsonb not null default '{}',communication_preferences jsonb not null default '{"email":true,"jobAlerts":true,"keepInTouch":false}',
 alternative_application_preferences jsonb not null default '{}',talent_pool_consent boolean not null default false,
 recruitment_marketing_consent boolean not null default false,keep_in_touch_consent boolean not null default false,
 consent_updated_at timestamptz,updated_at timestamptz not null default now(),primary key(tenant_id,candidate_id)
);
create table if not exists candidate_saved_jobs(
 tenant_id text not null,candidate_id text not null,job_id text not null,saved_at timestamptz not null default now(),
 primary key(tenant_id,candidate_id,job_id)
);
create table if not exists candidate_job_alerts(
 id text primary key,tenant_id text not null,candidate_id text,email text not null,query text,location text,department text,
 frequency text not null default 'WEEKLY',locale text not null default 'en-GB',status text not null default 'ACTIVE',
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists candidate_job_alerts_email on candidate_job_alerts(tenant_id,email,status);
create table if not exists candidate_experience_feedback(
 id text primary key,tenant_id text not null,candidate_id text,application_id text,kind text not null,
 rating int check(rating between 1 and 5),comments text,permission_to_contact boolean not null default false,
 created_at timestamptz not null default now()
);
create index if not exists candidate_experience_feedback_app on candidate_experience_feedback(tenant_id,application_id,created_at desc);

create table if not exists candidate_campaign_schedules(
 tenant_id text not null,candidate_id text not null,campaign_type text not null,scheduled_action_id text not null,status text not null default 'ACTIVE',
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(tenant_id,candidate_id,campaign_type)
);

alter table candidate_job_alerts add column if not exists manage_token text unique;
