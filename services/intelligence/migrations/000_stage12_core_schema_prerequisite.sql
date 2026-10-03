-- Stage 12 repair: promote the idempotent intelligence core schema into the immutable migration chain.
-- Intentionally ordered before the existing historical migrations.
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
create table if not exists copilot_conversations(
 id text primary key,tenant_id text not null,user_id text not null,title text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists copilot_conversations_user_idx on copilot_conversations(tenant_id,user_id,updated_at desc);
create table if not exists copilot_messages(
 id text primary key,tenant_id text not null,conversation_id text not null references copilot_conversations(id) on delete cascade,
 role text not null check(role in ('USER','ASSISTANT')),content text not null,intent text,
 citations jsonb not null default '[]',metadata jsonb not null default '{}',
 created_at timestamptz not null default now()
);
create index if not exists copilot_messages_conversation_idx on copilot_messages(tenant_id,conversation_id,created_at);
create table if not exists copilot_action_proposals(
 id text primary key,tenant_id text not null,conversation_id text not null references copilot_conversations(id) on delete cascade,
 message_id text references copilot_messages(id) on delete set null,
 action_type text not null,summary text not null,payload jsonb not null default '{}',
 status text not null default 'PROPOSED' check(status in ('PROPOSED','CONFIRMED','CANCELLED','FAILED')),
 created_by text,confirmed_by text,created_at timestamptz not null default now(),confirmed_at timestamptz,last_error text
);
create index if not exists copilot_actions_conversation_idx on copilot_action_proposals(tenant_id,conversation_id,created_at desc);
create table if not exists processed_events(event_id text primary key,processed_at timestamptz not null default now());

-- Stage 8 responsible-AI governance
create table if not exists ai_model_registry(
 id text primary key,tenant_id text not null,provider text not null,model text not null,version text not null,
 status text not null default 'DRAFT',capabilities jsonb not null default '[]',limitations jsonb not null default '[]',
 prohibited_uses jsonb not null default '["autonomous_hire","autonomous_reject","opaque_candidate_ranking","protected_trait_inference"]',
 approved_by text,approved_at timestamptz,review_due_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,provider,model,version)
);
create table if not exists ai_model_change_reviews(
 id text primary key,tenant_id text not null,provider text not null,from_model text,from_version text,to_model text not null,to_version text not null,
 change_summary text not null,risk_assessment jsonb not null default '{}',validation_evidence jsonb not null default '[]',
 decision text not null default 'PENDING',decided_by text,decided_at timestamptz,created_at timestamptz not null default now()
);
create table if not exists candidate_impact_assessments(
 id text primary key,tenant_id text not null,name text not null,system_scope text not null,purpose text not null,
 affected_groups jsonb not null default '[]',potential_harms jsonb not null default '[]',safeguards jsonb not null default '[]',
 human_oversight jsonb not null default '{}',transparency_measures jsonb not null default '[]',monitoring_plan jsonb not null default '{}',
 residual_risk text,status text not null default 'DRAFT',approved_by text,approved_at timestamptz,review_due_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
