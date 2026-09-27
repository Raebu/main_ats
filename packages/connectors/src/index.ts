export type ConnectorResult={status:"published"|"updated"|"closed"|"not_configured"|"failed";externalReference?:string;message?:string;receipt?:Record<string,unknown>};
export type ConnectorJob={id:string;reference:string;slug:string;title:string;description:string;summary:string;requirements:string;location:string;employmentType:string;datePosted?:string|null;validThrough?:string|null;hiringOrganisation?:string;canonicalUrl:string;salaryMin?:number|null;salaryMax?:number|null;salaryCurrency?:string|null;providerCopy?:Record<string,{title?:string;description?:string;summary?:string}>};
export interface JobBoardConnector{name:string;publish(job:ConnectorJob):Promise<ConnectorResult>;update(job:ConnectorJob):Promise<ConnectorResult>;close(job:ConnectorJob):Promise<ConnectorResult>;status(job:ConnectorJob):Promise<ConnectorResult>;}
export function notConfigured(name:string):ConnectorResult{return{status:"not_configured",message:name+" connector requires provider credentials/contract configuration"};}

export type HttpBoardConfig={
 name:string;displayName:string;endpointEnv:string;apiKeyEnv?:string;authHeader?:string;method?:"POST"|"PUT";
 publishPath?:string;updatePath?:string;closePath?:string;statusPath?:string;
};
function applyCopy(job:ConnectorJob,provider:string){const c=job.providerCopy?.[provider]||{};return{...job,title:c.title||job.title,description:c.description||job.description,summary:c.summary||job.summary};}
async function request(config:HttpBoardConfig,action:"publish"|"update"|"close"|"status",job:ConnectorJob):Promise<ConnectorResult>{
 const base=process.env[config.endpointEnv],apiKey=config.apiKeyEnv?process.env[config.apiKeyEnv]:undefined;
 if(!base||(config.apiKeyEnv&&!apiKey))return notConfigured(config.displayName);
 const paths={publish:config.publishPath||"/jobs",update:config.updatePath||"/jobs/"+encodeURIComponent(job.id),close:config.closePath||"/jobs/"+encodeURIComponent(job.id)+"/close",status:config.statusPath||"/jobs/"+encodeURIComponent(job.id)};
 const headers:Record<string,string>={"content-type":"application/json","accept":"application/json"};
 if(apiKey)headers[config.authHeader||"authorization"]=(config.authHeader?"":"Bearer ")+apiKey;
 const method=action==="status"?"GET":action==="publish"?(config.method||"POST"):action==="update"?"PUT":"POST";
 const r=await fetch(base.replace(/\/$/,"")+paths[action],{method,headers,body:method==="GET"?undefined:JSON.stringify({action,job:applyCopy(job,config.name)}),signal:AbortSignal.timeout(20000)});
 const text=await r.text();let body:any={};try{body=text?JSON.parse(text):{};}catch{body={message:text.slice(0,1000)};}
 if(!r.ok)return{status:"failed",message:String(body.message||body.error||config.displayName+" request failed: "+r.status),receipt:{httpStatus:r.status}};
 const externalReference=String(body.externalReference||body.id||body.jobId||job.id);
 return{status:action==="close"?"closed":action==="update"?"updated":"published",externalReference,message:body.message,receipt:{httpStatus:r.status,providerStatus:body.status||null}};
}
export function httpJobBoardConnector(config:HttpBoardConfig):JobBoardConnector{return{name:config.name,publish:j=>request(config,"publish",j),update:j=>request(config,"update",j),close:j=>request(config,"close",j),status:j=>request(config,"status",j)};}
