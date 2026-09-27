import { z } from "zod";
export const BaseEnv=z.object({
  NODE_ENV:z.enum(["development","test","production"]).default("development"),
  PORT:z.coerce.number().default(3000),
  DATABASE_URL:z.string().min(1),
  NATS_URL:z.string().default("nats://localhost:4222"),
  DEFAULT_TENANT_ID:z.string().default("tenant_raeburn_group"),
  SERVICE_NAME:z.string().min(1)
});
export function env(){return BaseEnv.parse(process.env);}
