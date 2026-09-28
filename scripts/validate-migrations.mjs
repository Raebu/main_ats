import fs from"node:fs/promises";import path from"node:path";
const root=path.resolve("services"),dirs=(await fs.readdir(root,{withFileTypes:true})).filter(x=>x.isDirectory());
const errors=[];
const destructive=[/\bdrop\s+table\b/i,/\bdrop\s+column\b/i,/\balter\s+column\b[^;]*\btype\b/i,/\bset\s+not\s+null\b/i,/\btruncate\b/i,/\bdelete\s+from\b(?![^;]*\bwhere\b)/i];
for(const dir of dirs){
  const schema=path.join(root,dir.name,"schema.sql");try{await fs.access(schema);}catch{continue;}
  const migrationDir=path.join(root,dir.name,"migrations");let files=[];
  try{files=(await fs.readdir(migrationDir)).filter(x=>x.endsWith(".sql")).sort();}catch{errors.push(dir.name+": missing migrations directory");continue;}
  if(!files.length){errors.push(dir.name+": no immutable migrations");continue;}
  const versions=new Set();
  for(const file of files){
    if(!/^\d{3,}_[a-z0-9_-]+\.sql$/i.test(file))errors.push(dir.name+"/"+file+": invalid migration filename");
    const version=file.split("_")[0];if(versions.has(version))errors.push(dir.name+": duplicate migration prefix "+version);versions.add(version);
    const sql=await fs.readFile(path.join(migrationDir,file),"utf8"),approved=/--\s*raeburn:destructive-approved\b/i.test(sql);
    if(!approved)for(const rule of destructive)if(rule.test(sql))errors.push(dir.name+"/"+file+": destructive/backward-incompatible SQL requires -- raeburn:destructive-approved and a reviewed expand/contract plan");
  }
}
if(errors.length){console.error(errors.join("\n"));process.exit(1);}
console.log("Migration validation passed for "+dirs.length+" service directories.");
