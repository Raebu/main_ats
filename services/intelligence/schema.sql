create table if not exists ai_runs(
 id text primary key,tenant_id text not null,task text not null,provider text,model text,prompt_version text,
 input_meta jsonb not null default '{}',result jsonb,status text not null,advisory_only boolean not null default true,
 requested_by text,created_at timestamptz not null default now(),completed_at timestamptz,last_error text
);
create table if not exists candidate_extractions(
 id text primary key,tenant_id text not null,candidate_id text not null,document_id text not null,parser_version text not null,
 extraction jsonb not null,status text not null default 'REVIEW_REQUIRED',reviewed_by text,reviewed_at timestamptz,
 created_at timestamptz not null default now(),unique(tenant_id,document_id,parser_version)
);
create table if not exists prompt_versions(
 id text primary key,tenant_id text not null,task text not null,version text not null,prompt text not null,
 active boolean not null default true,created_at timestamptz not null default now(),unique(tenant_id,task,version)
);
create table if not exists processed_events(event_id text primary key,processed_at timestamptz not null default now());