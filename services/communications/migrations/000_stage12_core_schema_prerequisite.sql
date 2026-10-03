-- Stage 12 repair: promote the idempotent communications core schema into the immutable migration chain.
-- Intentionally ordered before the existing historical migrations.
create table if not exists messages(id text primary key,tenant_id text not null,application_id text,recipient text not null,subject text,body text not null,status text not null,provider_message_id text,created_at timestamptz not null default now(),sent_at timestamptz);
create table if not exists processed_events(event_id text primary key,processed_at timestamptz not null default now());
create table if not exists outbox_events(id text primary key,event_type text not null,payload jsonb not null,created_at timestamptz not null default now(),published_at timestamptz,retry_count int not null default 0,last_error text);

alter table messages add column if not exists source_event_id text;
create unique index if not exists messages_source_event on messages(tenant_id,source_event_id,recipient,subject) where source_event_id is not null;

create table if not exists communication_templates(
 id text primary key,tenant_id text not null,key text not null,name text not null,channel text not null default 'EMAIL',
 subject_template text,body_template text not null,brand_scope text,active boolean not null default true,version int not null default 1,
 updated_by text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,key)
);
