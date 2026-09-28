import fs from "node:fs/promises";
import path from "node:path";

const servicesDir=path.resolve("services"),entries=(await fs.readdir(servicesDir,{withFileTypes:true})).filter(e=>e.isDirectory());
const failures=[];
for(const entry of entries){
  const service=entry.name,index=path.join(servicesDir,service,"src","index.ts");
  try{
    const code=await fs.readFile(index,"utf8");
    const hasRuntime=code.includes("installServiceRuntime(");
    const explicit=code.includes('"/ready"')&&code.includes('"/metrics"');
    if(!hasRuntime&&!explicit)failures.push(service+": missing shared runtime or explicit /ready + /metrics endpoints");
  }catch{}
  const schema=path.join(servicesDir,service,"schema.sql");
  try{
    await fs.access(schema);
    const migrations=path.join(servicesDir,service,"migrations");
    const files=(await fs.readdir(migrations)).filter(f=>f.endsWith(".sql"));
    if(!files.length)failures.push(service+": database-owning service has no immutable migration");
  }catch(error){
    if((error?.code||"")==="ENOENT")continue;
  }
}
const workerFiles=[];
async function walk(dir){
  for(const e of await fs.readdir(dir,{withFileTypes:true})){
    const p=path.join(dir,e.name);
    if(e.isDirectory())await walk(p);else if(/worker\.ts$/.test(e.name))workerFiles.push(p);
  }
}
await walk(servicesDir);
for(const file of workerFiles){
  const code=await fs.readFile(file,"utf8");
  if((code.includes("eventBus(")||code.includes(".subscribe("))&&!code.includes("consumeDurable("))failures.push(path.relative(process.cwd(),file)+": event worker bypasses durable consumer helper");
}
if(failures.length){console.error(failures.join("\n"));process.exit(1);}
console.log("Stage 9 runtime validation passed for "+entries.length+" service directories and "+workerFiles.length+" workers.");
