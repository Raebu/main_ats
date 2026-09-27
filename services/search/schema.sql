create table if not exists search_documents(
 id text not null,tenant_id text not null,type text not null,title text,body text,metadata jsonb not null default '{}',
 updated_at timestamptz not null default now(),
 search_vector tsvector generated always as (to_tsvector('english',coalesce(title,'')||' '||coalesce(body,''))) stored,
 primary key(tenant_id,type,id)
);
create index if not exists search_documents_fts on search_documents using gin(search_vector);
create index if not exists search_documents_type on search_documents(tenant_id,type,updated_at desc);
create index if not exists search_documents_metadata on search_documents using gin(metadata);

create table if not exists saved_searches(
 id text primary key,tenant_id text not null,user_id text not null,name text not null,resource_type text,
 query text not null,filters jsonb not null default '{}',alert_enabled boolean not null default false,
 last_alert_at timestamptz,next_alert_at timestamptz,alert_interval_minutes int not null default 1440,
 last_result_count int not null default 0,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table saved_searches add column if not exists last_alert_at timestamptz;
alter table saved_searches add column if not exists next_alert_at timestamptz;
alter table saved_searches add column if not exists alert_interval_minutes int not null default 1440;
alter table saved_searches add column if not exists last_result_count int not null default 0;
create index if not exists saved_search_alert_due on saved_searches(tenant_id,next_alert_at) where alert_enabled=true;

create table if not exists search_aliases(
 id text primary key,tenant_id text not null,term text not null,canonical_term text not null,kind text not null default 'ALIAS',
 created_at timestamptz not null default now(),unique(tenant_id,term)
);
create index if not exists search_aliases_canonical on search_aliases(tenant_id,canonical_term);

create table if not exists skill_ontology(
 id text primary key,tenant_id text not null,canonical_name text not null,category text,
 aliases jsonb not null default '[]',related_skills jsonb not null default '[]',
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,canonical_name)
);
create index if not exists skill_ontology_aliases on skill_ontology using gin(aliases);

create table if not exists search_alert_runs(
 id text primary key,tenant_id text not null,saved_search_id text not null,user_id text not null,
 result_count int not null default 0,new_result_count int not null default 0,
 sample_results jsonb not null default '[]',created_at timestamptz not null default now()
);
create index if not exists search_alert_runs_search on search_alert_runs(tenant_id,saved_search_id,created_at desc);

create table if not exists talent_graph_edges(
 id text primary key,tenant_id text not null,from_type text not null,from_id text not null,
 to_type text not null,to_id text not null,relation text not null,weight numeric not null default 1,
 evidence jsonb not null default '{}',updated_at timestamptz not null default now(),
 unique(tenant_id,from_type,from_id,to_type,to_id,relation)
);
create index if not exists talent_graph_from on talent_graph_edges(tenant_id,from_type,from_id);
create index if not exists talent_graph_to on talent_graph_edges(tenant_id,to_type,to_id);
