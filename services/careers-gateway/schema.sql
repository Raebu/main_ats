create table if not exists gateway_jobs(tenant_id text not null,gateway_id text not null,job_id text not null,visible boolean not null default true,featured boolean not null default false,priority int not null default 0,primary key(tenant_id,gateway_id,job_id));
create table if not exists processed_events(event_id text primary key,processed_at timestamptz not null default now());

create table if not exists gateway_definitions(
 tenant_id text not null,gateway_id text not null,name text not null,description text,enabled boolean not null default true,
 sort_order int not null default 0,config jsonb not null default '{}',updated_by text,updated_at timestamptz not null default now(),
 primary key(tenant_id,gateway_id)
);
insert into gateway_definitions(tenant_id,gateway_id,name,sort_order) values
('tenant_raeburn_group','MAINSTREAM','Mainstream',10),
('tenant_raeburn_group','DISABILITY_CONFIDENT','Disability Confident',20),
('tenant_raeburn_group','WOMEN','Women',30),
('tenant_raeburn_group','FORCES','Forces & Veterans',40),
('tenant_raeburn_group','RETURNERS','Returners',50),
('tenant_raeburn_group','EARLY_CAREERS','Early Careers',60),
('tenant_raeburn_group','FOUNDERS','Founders',70)
on conflict(tenant_id,gateway_id) do nothing;
