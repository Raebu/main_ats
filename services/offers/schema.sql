create table if not exists offers(id text primary key,tenant_id text not null,application_id text not null,version int not null default 1,status text not null default 'DRAFT',compensation jsonb not null default '{}',equity jsonb not null default '{}',conditions jsonb not null default '[]',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists outbox_events(id text primary key,event_type text not null,payload jsonb not null,created_at timestamptz not null default now(),published_at timestamptz,retry_count int not null default 0,last_error text);

alter table offers add column if not exists start_date date;
alter table offers add column if not exists probation text;
alter table offers add column if not exists benefits jsonb not null default '{}';
alter table offers add column if not exists expires_at timestamptz;
alter table offers add column if not exists decline_reason text;
alter table offers add column if not exists document_id text;
create table if not exists offer_templates(
 id text primary key,tenant_id text not null,name text not null,organisation_id text,template jsonb not null default '{}',
 active boolean not null default true,created_at timestamptz not null default now()
);
create table if not exists offer_versions(
 id text primary key,tenant_id text not null,offer_id text not null,version int not null,snapshot jsonb not null,
 created_by text,created_at timestamptz not null default now(),unique(tenant_id,offer_id,version)
);
create table if not exists offer_approvals(
 id text primary key,tenant_id text not null,offer_id text not null,approval_type text not null,status text not null default 'PENDING',
 requested_from text,decision_by text,decision_note text,requested_at timestamptz not null default now(),decided_at timestamptz,
 unique(tenant_id,offer_id,approval_type)
);
create table if not exists offer_negotiations(
 id text primary key,tenant_id text not null,offer_id text not null,author_type text not null,note text not null,
 proposal jsonb not null default '{}',created_at timestamptz not null default now()
);

alter table offers add column if not exists salary_band_id text;
alter table offers add column if not exists required_approvals jsonb not null default '[]';
alter table offers add column if not exists issued_at timestamptz;
alter table offers add column if not exists accepted_at timestamptz;
alter table offers add column if not exists declined_at timestamptz;
alter table offers add column if not exists expired_at timestamptz;
alter table offers add column if not exists updated_by text;
create table if not exists offer_approval_rules(
 id text primary key,tenant_id text not null,organisation_id text,approval_type text not null,
 condition jsonb not null default '{}',required boolean not null default true,active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists offer_documents(
 id text primary key,tenant_id text not null,offer_id text not null,document_type text not null,version int not null,
 title text not null,content text not null,content_hash text not null,status text not null default 'GENERATED',
 created_by text,created_at timestamptz not null default now(),
 unique(tenant_id,offer_id,document_type,version)
);
create table if not exists offer_signatures(
 id text primary key,tenant_id text not null,offer_id text not null,signer_name text not null,signer_role text not null default 'CANDIDATE',
 signature_hash text not null,accepted_terms boolean not null,ip_hash text,user_agent_hash text,
 signed_at timestamptz not null default now(),unique(tenant_id,offer_id,signer_role)
);
create index if not exists offers_expiry on offers(tenant_id,status,expires_at);
