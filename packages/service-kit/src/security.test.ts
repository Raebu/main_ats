import{afterEach,describe,expect,it}from"vitest";
import{mkdtempSync,rmSync,writeFileSync}from"node:fs";
import{join}from"node:path";
import{tmpdir}from"node:os";
import{organisationScope,secretValue,serviceAuthHeaders,serviceAuthRequired,tenantDecrypt,tenantEncrypt,verifyServiceAuth}from"./index";

const touched=new Set<string>();
function env(name:string,value:string){touched.add(name);process.env[name]=value;}
afterEach(()=>{for(const k of touched)delete process.env[k];touched.clear();});

describe("secret-manager mount support",()=>{
 it("loads a secret from NAME_FILE when no direct value is present",()=>{
  const dir=mkdtempSync(join(tmpdir(),"raeburn-secret-"));try{const file=join(dir,"secret");writeFileSync(file,"mounted-secret\n");env("TEST_STAGE8_SECRET_FILE",file);expect(secretValue("TEST_STAGE8_SECRET")).toBe("mounted-secret");}finally{rmSync(dir,{recursive:true,force:true});}
 });
 it("prefers a directly injected secret to the mounted file",()=>{
  const dir=mkdtempSync(join(tmpdir(),"raeburn-secret-"));try{const file=join(dir,"secret");writeFileSync(file,"file-secret");env("TEST_STAGE8_SECRET_FILE",file);env("TEST_STAGE8_SECRET","direct-secret");expect(secretValue("TEST_STAGE8_SECRET")).toBe("direct-secret");}finally{rmSync(dir,{recursive:true,force:true});}
 });
});

describe("tenant encryption isolation",()=>{
 it("decrypts within the same tenant and fails with a different tenant context",()=>{
  env("TENANT_ENCRYPTION_MASTER_KEY","stage8-test-master-key-at-least-32-bytes");
  const encrypted=tenantEncrypt("tenant-a","candidate-private-data");
  expect(tenantDecrypt("tenant-a",encrypted)).toBe("candidate-private-data");
  expect(()=>tenantDecrypt("tenant-b",encrypted)).toThrow();
 });
});

describe("organisation access scope",()=>{
 it("allows only organisations present in the authoritative membership header",()=>{
  const h=new Headers({"x-organisation-ids":"org-a,org-b"}),scope=organisationScope(h);
  expect(scope.canAccess("org-a")).toBe(true);
  expect(scope.canAccess("org-c")).toBe(false);
 });
 it("supports explicit group-wide wildcard access",()=>{
  const scope=organisationScope(new Headers({"x-organisation-ids":"*"}));
  expect(scope.canAccess("org-any")).toBe(true);
 });
});

describe("production service authentication",()=>{
 it("requires signed internal requests by default in production",()=>{
  env("NODE_ENV","production");env("SERVICE_AUTH_SECRET","service-auth-test-secret");env("SERVICE_NAME","stage8-test");
  expect(serviceAuthRequired()).toBe(true);
  const signed=serviceAuthHeaders({"x-tenant-id":"tenant-a","x-correlation-id":"corr-1"}),headers=new Headers(signed);
  expect(verifyServiceAuth(headers)).toBe(true);
  headers.set("x-tenant-id","tenant-b");
  expect(verifyServiceAuth(headers)).toBe(false);
 });
 it("rejects unsigned internal requests in production",()=>{
  env("NODE_ENV","production");env("SERVICE_AUTH_SECRET","service-auth-test-secret");
  expect(verifyServiceAuth(new Headers({"x-tenant-id":"tenant-a"}))).toBe(false);
 });
});
