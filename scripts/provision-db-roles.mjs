import fs from "node:fs/promises";
import pg from "pg";

const services=["jobs","candidates","applications","attribution","workflow","documents","communications","distribution","identity","organisations","audit","notifications","privacy","interviews","assessments","offers","talent-pools","careers-gateway","configuration","feature-flags","campaigns","webhooks","integrations","analytics","search","intelligence","scheduler","onboarding"];
const adminUrl=process.env.DATABASE_ADMIN_URL;
if(!adminUrl)throw new Error("DATABASE_ADMIN_URL is required");
const ident=v=>'"'+String(v).replace(/"/g,'""')+'"',literal=v=>"'"+String(v).replace(/'/g,"''")+"'";
async function secret(name){if(process.env[name])return process.env[name];if(process.env[name+"_FILE"])return (await fs.readFile(process.env[name+"_FILE"],"utf8")).trim();throw new Error("Missing "+name+" or "+name+"_FILE");}
const admin=new pg.Client({connectionString:adminUrl});await admin.connect();
try{
 for(const service of services){
   const stem=service.replace(/-/g,"_"),db=stem,runtime=stem+"_runtime",migrator=stem+"_migrator";
   const runtimePass=await secret(stem.toUpperCase()+"_DB_RUNTIME_PASSWORD"),migratorPass=await secret(stem.toUpperCase()+"_DB_MIGRATOR_PASSWORD");
   for(const [role,password] of [[runtime,runtimePass],[migrator,migratorPass]]){
     const exists=(await admin.query("select 1 from pg_roles where rolname=$1",[role])).rowCount;
     if(!exists)await admin.query("create role "+ident(role)+" login password "+literal(password));
     else await admin.query("alter role "+ident(role)+" login password "+literal(password));
   }
   await admin.query("grant connect on database "+ident(db)+" to "+ident(runtime)+","+ident(migrator));
   const u=new URL(adminUrl);u.pathname="/"+db;const dbClient=new pg.Client({connectionString:u.toString()});await dbClient.connect();
   try{
     await dbClient.query("grant usage on schema public to "+ident(runtime));
     await dbClient.query("grant select,insert,update,delete on all tables in schema public to "+ident(runtime));
     await dbClient.query("grant usage,select,update on all sequences in schema public to "+ident(runtime));
     await dbClient.query("grant all on schema public to "+ident(migrator));
     await dbClient.query("grant all privileges on all tables in schema public to "+ident(migrator));
     await dbClient.query("grant all privileges on all sequences in schema public to "+ident(migrator));
     await dbClient.query("alter default privileges for role "+ident(migrator)+" in schema public grant select,insert,update,delete on tables to "+ident(runtime));
     await dbClient.query("alter default privileges for role "+ident(migrator)+" in schema public grant usage,select,update on sequences to "+ident(runtime));
     await dbClient.query("revoke create on schema public from "+ident(runtime));
   }finally{await dbClient.end();}
   console.log("Provisioned least-privilege roles for",service);
 }
}finally{await admin.end();}
