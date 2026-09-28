import fs from"node:fs";
const proofPath=process.env.STAGE12_PRODUCTION_PROOF||"production-proof.json";
if(!fs.existsSync(proofPath)){console.error("Stage 12 is not live: missing production proof file "+proofPath);process.exit(1);}
const p=JSON.parse(fs.readFileSync(proofPath,"utf8"));
const required={
 infrastructure:["managedPostgres","natsPersistent","r2Private","malwareScanner","smtp","cloudflare","oauth","backups","monitoring","alerting","stagingParity"],
 cutover:["rootTrafficMigrated","dataParity","dualReadValidated","legacyRoutesRetired","duplicatePrismaRemoved","transitionalArchived","deploymentUnitsConsolidated"],
 commercialisation:["tenantProvisioning","customerBranding","entitlementsSubscriptions","usageMetering","billing","customerSupport","customDomains","onboardingOffboarding","regionalDeployment","customerApiKeys","slaTooling","externalDocumentation"],
 operations:["runbooks","incidentResponse","securityContacts","serviceOwners","onCall","slos","changeManagement","postmortems","releaseProcess","capacityCostMonitoring","penetrationTestPassed","backupRestoreDrill"]
};
const failures=[];for(const[group,keys]of Object.entries(required))for(const key of keys)if(p?.[group]?.[key]!==true)failures.push(group+"."+key);
if(p.environment!=="production")failures.push("environment must be production");
for(const legacy of["prisma/schema.prisma","prisma/seed.ts","lib/db.ts","app/admin/page.tsx","app/api/applications/route.ts"])if(fs.existsSync(legacy))failures.push("legacy artifact still present: "+legacy);
console.log(JSON.stringify({stage:12,gate:"live-production-cutover",status:failures.length?"FAILED":"PASSED",proof:proofPath,failures},null,2));if(failures.length)process.exit(1);
