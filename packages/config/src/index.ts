import{readFileSync}from"node:fs";import{z}from"zod";
export const BaseEnv=z.object({
 NODE_ENV:z.enum(["development","test","production"]).default("development"),
 PORT:z.coerce.number().default(3000),DATABASE_URL:z.string().min(1),NATS_URL:z.string().default("nats://localhost:4222"),
 DEFAULT_TENANT_ID:z.string().default("tenant_raeburn_group"),SERVICE_NAME:z.string().min(1)
});
export function env(){return BaseEnv.parse(process.env);}
export function secret(name:string,options:{requiredInProduction?:boolean}={}){
 const direct=process.env[name],file=process.env[name+"_FILE"];
 const value=direct||(file?readFileSync(file,"utf8").trim():undefined);
 if(!value&&options.requiredInProduction&&process.env.NODE_ENV==="production")throw new Error("Required production secret "+name+" is not configured. Inject it directly or through "+name+"_FILE from the platform secret manager.");
 return value;
}
export function requireProductionSecrets(names:string[]){
 if(process.env.NODE_ENV!=="production")return;
 const missing=names.filter(name=>!secret(name));if(missing.length)throw new Error("Missing production secrets: "+missing.join(", "));
}
