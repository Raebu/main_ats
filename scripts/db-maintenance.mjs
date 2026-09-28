import pg from "pg";

const services=["jobs","candidates","applications","attribution","workflow","documents","communications","distribution","identity","organisations","audit","notifications","privacy","interviews","assessments","offers","talent-pools","careers-gateway","configuration","feature-flags","campaigns","webhooks","integrations","analytics","search","intelligence","scheduler","onboarding"];
const requested=process.argv.slice(2),targets=requested.length?requested:services,base=process.env.DATABASE_BASE_URL||"postgresql://postgres:postgres@localhost:5433";
for(const service of targets){
  const stem=service.replace(/-/g,"_"),env=stem.toUpperCase()+"_DATABASE_URL",url=process.env[env]||base+"/"+stem;
  const client=new pg.Client({connectionString:url,application_name:"raeburn-db-maintenance"});
  await client.connect();
  try{
    const before=(await client.query("select coalesce(sum(n_dead_tup),0)::bigint dead,coalesce(sum(n_live_tup),0)::bigint live from pg_stat_user_tables")).rows[0];
    await client.query("vacuum (analyze)");
    const slow=await client.query("select relname,n_live_tup,n_dead_tup,last_autovacuum,last_autoanalyze from pg_stat_user_tables order by n_dead_tup desc limit 20");
    console.log(JSON.stringify({service,before,tables:slow.rows}));
  }finally{await client.end();}
}
