import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const services=["jobs","candidates","applications","attribution","workflow","documents","communications","distribution","identity","organisations","audit","notifications","privacy","interviews","assessments","offers","talent-pools","careers-gateway","configuration","feature-flags","campaigns","webhooks","integrations","analytics","search","intelligence","scheduler","onboarding","platform"];
const requested=process.argv.slice(2),targets=requested.length?requested:services;
const stamp=new Date().toISOString().replace(/[:.]/g,"-"),root=path.resolve(process.env.BACKUP_DIR||"backups",stamp);
await fs.mkdir(root,{recursive:true});

function envName(service){return service.replace(/-/g,"_").toUpperCase()+"_DATABASE_URL";}
function run(cmd,args,env=process.env){return new Promise((resolve,reject)=>{const p=spawn(cmd,args,{stdio:["ignore","inherit","inherit"],env});p.on("error",reject);p.on("exit",code=>code===0?resolve(undefined):reject(new Error(cmd+" exited "+code)));});}
async function sha256(file){const b=await fs.readFile(file);return crypto.createHash("sha256").update(b).digest("hex");}
const base=process.env.DATABASE_BASE_URL||"postgresql://postgres:postgres@localhost:5433";
const manifest={createdAt:new Date().toISOString(),format:"pg_dump-custom",services:[]};

for(const service of targets){
  if(!services.includes(service))throw new Error("Unknown service: "+service);
  const url=process.env[envName(service)]||base+"/"+service.replace(/-/g,"_");
  const file=path.join(root,service+".dump");
  await run(process.env.PG_DUMP_BIN||"pg_dump",["--format=custom","--compress=6","--no-owner","--no-acl","--file",file,url]);
  const stat=await fs.stat(file),checksum=await sha256(file);
  manifest.services.push({service,file:path.basename(file),bytes:stat.size,sha256:checksum});
}
await fs.writeFile(path.join(root,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
console.log("Backup completed:",root);
