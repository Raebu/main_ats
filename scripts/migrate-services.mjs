import fs from"node:fs/promises";
import path from"node:path";
import crypto from"node:crypto";
import pg from"pg";

const allServices=["jobs","candidates","applications","attribution","workflow","documents","communications","distribution","identity","organisations","audit","notifications","privacy","interviews","assessments","offers","talent-pools","careers-gateway","configuration","feature-flags","campaigns","webhooks","integrations","analytics","search","intelligence","scheduler","onboarding","platform"];
const requested=process.argv.slice(2),services=requested.length?requested:allServices;
const base=process.env.DATABASE_BASE_URL||"postgresql://postgres:postgres@localhost:5433",adminUrl=process.env.DATABASE_ADMIN_URL;

for(const service of services){
  const db=service.replace(/-/g,"_"),envName=service.replace(/-/g,"_").toUpperCase()+"_DATABASE_URL";
  const url=process.env[envName]||(adminUrl?(()=>{const u=new URL(adminUrl);u.pathname="/"+db;return u.toString();})():base+"/"+db),client=new pg.Client({connectionString:url});
  await client.connect();
  const lockKey="raeburn-migrations:"+service;
  try{
    await client.query("select pg_advisory_lock(hashtext($1)::bigint)",[lockKey]);
    await client.query("create table if not exists _schema_migrations(version text primary key,checksum text not null,applied_at timestamptz not null default now())");
    const dir=path.resolve("services",service,"migrations");
    let entries=[];
    try{entries=(await fs.readdir(dir)).filter(x=>x.endsWith(".sql")).sort();}catch{}
    if(!entries.length)throw new Error(service+" has no immutable migrations; refusing schema.sql fallback");
    for(const file of entries){
      const version=file.replace(/\.sql$/,""),sql=await fs.readFile(path.join(dir,file),"utf8");
      const checksum=crypto.createHash("sha256").update(sql).digest("hex");
      const applied=(await client.query("select checksum from _schema_migrations where version=$1",[version])).rows[0];
      if(applied){
        if(applied.checksum!==checksum)throw new Error(service+" migration checksum mismatch: "+file+" (migrations are immutable)");
        continue;
      }
      const noTransaction=/^\s*--\s*raeburn:no-transaction\b/im.test(sql);
      if(noTransaction){
        await client.query(sql);
        await client.query("insert into _schema_migrations(version,checksum) values($1,$2)",[version,checksum]);
      }else{
        await client.query("begin");
        try{
          await client.query("set local lock_timeout='10s'");
          await client.query("set local statement_timeout='5min'");
          await client.query(sql);
          await client.query("insert into _schema_migrations(version,checksum) values($1,$2)",[version,checksum]);
          await client.query("commit");
        }catch(error){await client.query("rollback");throw error;}
      }
      console.log("applied",service,file);
    }
  }finally{
    try{await client.query("select pg_advisory_unlock(hashtext($1)::bigint)",[lockKey]);}catch{}
    await client.end();
  }
}
