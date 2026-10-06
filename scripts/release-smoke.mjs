const base=(process.env.SMOKE_BASE_URL||"").replace(/\/$/,"");
if(!base)throw new Error("SMOKE_BASE_URL is required");

const timeoutMs=Number(process.env.SMOKE_TIMEOUT_MS||300000);
const intervalMs=Number(process.env.SMOKE_INTERVAL_MS||5000);
const requestTimeoutMs=Number(process.env.SMOKE_REQUEST_TIMEOUT_MS||10000);
const retryStatuses=new Set([408,425,429,500,502,503,504]);
const deadline=Date.now()+timeoutMs;

async function waitForPath(path){
  let attempt=0;
  let lastError="not attempted";

  while(Date.now()<deadline){
    attempt+=1;
    try{
      const response=await fetch(base+path,{
        headers:{"x-tenant-id":"tenant_raeburn_group"},
        signal:AbortSignal.timeout(requestTimeoutMs)
      });
      if(response.ok){
        console.log(`Smoke ready: ${path} returned ${response.status} on attempt ${attempt}`);
        return;
      }
      lastError=`${path} returned ${response.status}`;
      if(!retryStatuses.has(response.status)){
        throw new Error(lastError);
      }
    }catch(error){
      if(error instanceof Error && /returned (?!408|425|429|500|502|503|504)\d{3}/.test(error.message)){
        throw error;
      }
      lastError=error instanceof Error?`${error.name}: ${error.message}`:String(error);
    }

    console.log(`Smoke waiting for ${path} (attempt ${attempt}): ${lastError}`);
    await new Promise(resolve=>setTimeout(resolve,intervalMs));
  }

  throw new Error(`${path} did not become ready within ${timeoutMs}ms; last result: ${lastError}`);
}

for(const path of ["/health","/v1/jobs/public"]){
  await waitForPath(path);
}
console.log(JSON.stringify({ok:true,base}));
