import pg from"pg";
const mode=process.argv[2]||"prepare";
const services=["jobs","candidates","applications","attribution","workflow","documents","communications","distribution","identity","organisations","audit","notifications","privacy","interviews","assessments","offers","talent-pools","careers-gateway","configuration","feature-flags","campaigns","webhooks","integrations","analytics","search","intelligence","scheduler","onboarding","platform"];
const adminUrl=process.env.DATABASE_ADMIN_URL,runtimePassword=process.env.DATABASE_RUNTIME_PASSWORD;
if(!adminUrl)throw new Error("DATABASE_ADMIN_URL is required");
if(!runtimePassword)throw new Error("DATABASE_RUNTIME_PASSWORD is required");
const ident=v=>'"'+String(v).replace(/"/g,'""')+'"',literal=v=>"'"+String(v).replace(/'/g,"''")+"'";
const admin=new pg.Client({connectionString:adminUrl});await admin.connect();
try{
 const role="talent_runtime",exists=(await admin.query("select 1 from pg_roles where rolname=$1",[role])).rowCount;
 if(!exists)await admin.query("create role "+ident(role)+" login password "+literal(runtimePassword));
 else await admin.query("alter role "+ident(role)+" login password "+literal(runtimePassword));
 if(mode==="prepare"){
   for(const service of services){const db=service.replace(/-/g,"_"),existsDb=(await admin.query("select 1 from pg_database where datname=$1",[db])).rowCount;if(!existsDb){await admin.query("create database "+ident(db));console.log("created",db);}await admin.query("grant connect on database "+ident(db)+" to "+ident(role));}
 }else if(mode==="grant"){
   const adminRole=(await admin.query("select current_user u")).rows[0].u;
   for(const service of services){const db=service.replace(/-/g,"_"),u=new URL(adminUrl);u.pathname="/"+db;const client=new pg.Client({connectionString:u.toString()});await client.connect();try{await client.query("grant usage on schema public to "+ident(role));await client.query("grant select,insert,update,delete on all tables in schema public to "+ident(role));await client.query("grant usage,select,update on all sequences in schema public to "+ident(role));await client.query("alter default privileges for role "+ident(adminRole)+" in schema public grant select,insert,update,delete on tables to "+ident(role));await client.query("alter default privileges for role "+ident(adminRole)+" in schema public grant usage,select,update on sequences to "+ident(role));await client.query("revoke create on schema public from "+ident(role));console.log("granted",db);}finally{await client.end();}}
 }else throw new Error("mode must be prepare or grant");
}finally{await admin.end();}
