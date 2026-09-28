import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";
import { spawn } from "node:child_process";

const manifestPath=path.resolve(process.env.BACKUP_MANIFEST||process.argv[2]||"");
if(!process.env.BACKUP_MANIFEST&&!process.argv[2])throw new Error("Provide BACKUP_MANIFEST or manifest path argument");
const adminUrl=process.env.RESTORE_DRILL_ADMIN_URL;
if(!adminUrl)throw new Error("RESTORE_DRILL_ADMIN_URL is required; it must point to a disposable PostgreSQL cluster/database");
const manifest=JSON.parse(await fs.readFile(manifestPath,"utf8")),dir=path.dirname(manifestPath);
function ident(v){return '"'+String(v).replace(/"/g,'""')+'"';}
function run(cmd,args){return new Promise((resolve,reject)=>{const p=spawn(cmd,args,{stdio:["ignore","inherit","inherit"]});p.on("error",reject);p.on("exit",code=>code===0?resolve(undefined):reject(new Error(cmd+" exited "+code)));});}
async function sha256(file){return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");}
const admin=new pg.Client({connectionString:adminUrl});await admin.connect();
const results=[];
try{
 for(const item of manifest.services){
   const file=path.join(dir,item.file);if(await sha256(file)!==item.sha256)throw new Error("Checksum mismatch for "+item.service);
   const db=("restore_"+item.service.replace(/-/g,"_")+"_"+Date.now()).slice(0,63);
   await admin.query("create database "+ident(db));
   const u=new URL(adminUrl);u.pathname="/"+db;const target=u.toString();
   try{
     await run(process.env.PG_RESTORE_BIN||"pg_restore",["--exit-on-error","--no-owner","--no-acl","--dbname",target,file]);
     const check=new pg.Client({connectionString:target});await check.connect();
     const migrations=await check.query("select count(*)::int n from _schema_migrations").catch(()=>({rows:[{n:0}]}));
     const tables=await check.query("select count(*)::int n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'");
     await check.end();
     if(Number(tables.rows[0].n)<1)throw new Error("Restored database has no application tables");
     results.push({service:item.service,tables:Number(tables.rows[0].n),migrations:Number(migrations.rows[0].n)});
   }finally{
     await admin.query("select pg_terminate_backend(pid) from pg_stat_activity where datname=$1 and pid<>pg_backend_pid()",[db]);
     await admin.query("drop database if exists "+ident(db));
   }
 }
}finally{await admin.end();}
console.log(JSON.stringify({ok:true,verifiedAt:new Date().toISOString(),results},null,2));
