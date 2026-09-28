const required={
  NODE_ENV:"production",
  DATABASE_PITR_ENABLED:"true",
  DATABASE_BACKUPS_ENCRYPTED:"true",
  DATABASE_RESTORE_DRILL_VERIFIED:"true",
  NATS_JETSTREAM_PERSISTENT:"true",
  OBJECT_STORAGE_VERSIONING_ENABLED:"true",
  MALWARE_SCANNING_ENABLED:"true",
  OTEL_ENABLED:"true",
  CENTRAL_LOGGING_ENABLED:"true",
  ALERTING_ENABLED:"true"
};
const failures=[];
for(const[key,expected]of Object.entries(required))if(String(process.env[key]||"").toLowerCase()!==expected)failures.push(key+" must be "+expected);
for(const name of["DATABASE_ADMIN_URL","NATS_URL","R2_ENDPOINT","OTEL_EXPORTER_OTLP_ENDPOINT"]){if(!process.env[name])failures.push(name+" is required");}
if(failures.length){console.error("Stage 9 production gate failed:\n- "+failures.join("\n- "));process.exit(1);}
console.log("Stage 9 production gate passed.");
