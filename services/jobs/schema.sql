create table if not exists jobs(
 id text primary key,tenant_id text not null,reference text not null,slug text not null,title text not null,
 hiring_organisation_id text not null,operating_organisation_id text,department text,location text not null,
 workplace_type text not null,employment_type text not null,engagement text,summary text not null,
 description text not null,requirements text not null,benefits text,status text not null default 'DRAFT',
 audiences jsonb not null default '[]',date_posted timestamptz,valid_through timestamptz,version int not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,reference),unique(tenant_id,slug)
);
create index if not exists jobs_tenant_status on jobs(tenant_id,status);
create table if not exists outbox_events(id text primary key,event_type text not null,payload jsonb not null,created_at timestamptz not null default now(),published_at timestamptz,retry_count int not null default 0,last_error text);