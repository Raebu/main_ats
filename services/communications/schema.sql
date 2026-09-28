create table if not exists messages(id text primary key,tenant_id text not null,application_id text,recipient text not null,subject text,body text not null,status text not null,provider_message_id text,created_at timestamptz not null default now(),sent_at timestamptz);
create table if not exists processed_events(event_id text primary key,processed_at timestamptz not null default now());
create table if not exists outbox_events(id text primary key,event_type text not null,payload jsonb not null,created_at timestamptz not null default now(),published_at timestamptz,retry_count int not null default 0,last_error text);

alter table messages add column if not exists source_event_id text;
create unique index if not exists messages_source_event on messages(tenant_id,source_event_id,recipient,subject) where source_event_id is not null;
