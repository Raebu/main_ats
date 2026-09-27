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