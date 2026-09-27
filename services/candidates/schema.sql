create table if not exists candidates(
 id text primary key,tenant_id text not null,email text not null,name text not null,telephone text,location text,linkedin text,portfolio text,
 profile jsonb not null default '{}',tags jsonb not null default '[]',custom_fields jsonb not null default '{}',
 owner_user_id text,do_not_contact boolean not null default false,suppression_reason text,
 relationship_status text not null default 'PROSPECT',freshness_at timestamptz,last_contact_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(tenant_id,email)
);
alter table candidates add column if not exists profile jsonb not null default '{}';
alter table candidates add column if not exists tags jsonb not null default '[]';
alter table candidates add column if not exists custom_fields jsonb not null default '{}';
alter table candidates add column if not exists owner_user_id text;
alter table candidates add column if not exists do_not_contact boolean not null default false;
alter table candidates add column if not exists suppression_reason text;
alter table candidates add column if not exists relationship_status text not null default 'PROSPECT';
alter table candidates add column if not exists freshness_at timestamptz;
alter table candidates add column if not exists last_contact_at timestamptz;
create index if not exists candidate_lookup on candidates(tenant_id,email);
create index if not exists candidate_owner on candidates(tenant_id,owner_user_id);
create table if not exists candidate_sources(
 id text primary key,tenant_id text not null,candidate_id text not null,source text not null,detail jsonb not null default '{}',
 first_seen_at timestamptz not null default now(),last_seen_at timestamptz not null default now(),
 unique(tenant_id,candidate_id,source)
);
create table if not exists candidate_timeline(
 id text primary key,tenant_id text not null,candidate_id text not null,event_type text not null,title text not null,
 detail jsonb not null default '{}',occurred_at timestamptz not null default now(),actor text
);
create index if not exists candidate_timeline_idx on candidate_timeline(tenant_id,candidate_id,occurred_at desc);
create table if not exists candidate_merges(
 id text primary key,tenant_id text not null,primary_candidate_id text not null,merged_candidate_id text not null,
 merged_at timestamptz not null default now(),actor text
);
create table if not exists outbox_events(id text primary key,event_type text not null,payload jsonb not null,created_at timestamptz not null default now(),published_at timestamptz,retry_count int not null default 0,last_error text);