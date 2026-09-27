create table if not exists notifications(id text primary key,tenant_id text not null,kind text not null,title text not null,body text not null,resource_type text,resource_id text,severity text not null default 'INFO',read_at timestamptz,created_at timestamptz not null default now());
create table if not exists processed_events(event_id text primary key,processed_at timestamptz not null default now());

create table if not exists notification_preferences(
 tenant_id text not null,user_id text not null,kind text not null,channel text not null default 'IN_APP',
 enabled boolean not null default true,digest text not null default 'IMMEDIATE',quiet_hours jsonb not null default '{}',
 primary key(tenant_id,user_id,kind,channel)
);
create table if not exists notification_groups(
 id text primary key,tenant_id text not null,user_id text,group_key text not null,title text not null,
 unread_count int not null default 0,last_notification_at timestamptz not null default now(),
 unique(tenant_id,user_id,group_key)
);
