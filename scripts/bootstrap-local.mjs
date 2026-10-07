import fs from "node:fs/promises";import path from "node:path";import{execFileSync}from"node:child_process";import pg from "pg";
const services=["jobs","candidates","applications","attribution","workflow","documents","communications","distribution","identity","organisations","audit","notifications","privacy","interviews","assessments","offers","talent-pools","careers-gateway","configuration","feature-flags","campaigns","webhooks","integrations","analytics","search","intelligence","scheduler","onboarding","platform"];
const adminUrl=process.env.LOCAL_POSTGRES_ADMIN_URL||"postgresql://postgres:postgres@localhost:5433/postgres";
const admin=new pg.Client({connectionString:adminUrl});await admin.connect();
for(const service of services){const db=service.replace(/-/g,"_");const exists=await admin.query("select 1 from pg_database where datname=$1",[db]);if(!exists.rowCount)await admin.query('create database "'+db+'"');}
await admin.end();
for(const service of services){const db=service.replace(/-/g,"_"),url="postgresql://postgres:postgres@localhost:5433/"+db,client=new pg.Client({connectionString:url});await client.connect();await client.query("create extension if not exists pg_stat_statements");const schema=await fs.readFile(path.resolve("services",service,"schema.sql"),"utf8");await client.query(schema);try{const seed=await fs.readFile(path.resolve("services",service,"seed.sql"),"utf8");await client.query(seed);}catch(e){if(e?.code!=="ENOENT")throw e;}await client.end();console.log("ready",service,db);}
execFileSync(process.execPath,["scripts/migrate-services.mjs"],{
  stdio:"inherit",
  env:{...process.env,DATABASE_BASE_URL:"postgresql://postgres:postgres@localhost:5433"}
});
console.log("Raeburn Talent local databases, seeds and immutable migrations are ready.");