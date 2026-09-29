import{generateKeyPairSync,randomBytes}from"node:crypto";import fs from"node:fs/promises";import path from"node:path";
const environment=(process.argv[2]||"production").toLowerCase();if(!["staging","production"].includes(environment))throw new Error("Use staging or production");
const outDir=path.resolve(".raeburn-deploy");await fs.mkdir(outDir,{recursive:true});
const rand=()=>randomBytes(32).toString("hex");
const dbPassword=rand(),routingSecret=rand(),serviceAuth=rand(),tenantKey=rand(),uploadSecret=rand(),mfaKey=rand(),authSecret=rand(),scannerToken=rand();
const{privateKey,publicKey}=generateKeyPairSync("rsa",{modulusLength:3072,publicKeyEncoding:{type:"spki",format:"pem"},privateKeyEncoding:{type:"pkcs8",format:"pem"}});
const esc=s=>s.trim().replace(/\n/g,"\\n");
const prod=environment==="production";
const apiDomain=prod?"api.talent.theraeburngroup.com":"api.staging.talent.theraeburngroup.com";
const adminDomain=prod?"talent.theraeburngroup.com":"talent.staging.theraeburngroup.com";
const careersDomain=prod?"careers.theraeburngroup.com":"careers.staging.theraeburngroup.com";
const runtime=`NODE_ENV=production
DEFAULT_TENANT_ID=tenant_raeburn_group
ENFORCE_TENANT_ENTITLEMENTS=true

# DATABASE_BASE_URL and NATS_URL are injected automatically by Release.

# Cloudflare R2 document storage — fill these four values.
R2_ENDPOINT=https://CLOUDFLARE_ACCOUNT_ID.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=PASTE_DOCUMENT_R2_ACCESS_KEY
R2_SECRET_ACCESS_KEY=PASTE_DOCUMENT_R2_SECRET_KEY
R2_BUCKET=raeburn-talent-${environment}-documents
R2_FORCE_PATH_STYLE=false

SERVICE_AUTH_SECRET=${serviceAuth}
TENANT_ENCRYPTION_MASTER_KEY=${tenantKey}
APPLICATION_UPLOAD_SECRET=${uploadSecret}
MFA_ENCRYPTION_KEY=${mfaKey}
AUTH_SECRET=${authSecret}
AUTH_KEY_ID=talent-primary
AUTH_PRIVATE_KEY_PEM=${esc(privateKey)}
AUTH_PUBLIC_KEY_PEM=${esc(publicKey)}
CAREERS_ROUTING_SECRET=${routingSecret}

WEBAUTHN_RP_ID=${adminDomain}
WEBAUTHN_ORIGIN=https://${adminDomain}

BOOTSTRAP_ADMIN_EMAIL=PASTE_YOUR_ADMIN_EMAIL
BOOTSTRAP_ADMIN_PASSWORD=PASTE_A_LONG_TEMPORARY_PASSWORD

API_DOMAIN=${apiDomain}
TLS_CONTACT_EMAIL=PASTE_YOUR_ADMIN_EMAIL
TALENT_ADMIN_URL=https://${adminDomain}
CAREERS_BASE_URL=https://${careersDomain}
CORS_ORIGINS=https://${adminDomain},https://${careersDomain}

# Fill with your production SMTP provider values.
SMTP_HOST=PASTE_SMTP_HOST
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=PASTE_SMTP_USER
SMTP_PASS=PASTE_SMTP_PASSWORD
SMTP_FROM=Raeburn Talent <careers@theraeburngroup.com>

DOCUMENT_SCAN_MODE=production
MALWARE_SCANNER_URL=http://malware-scanner:4130/scan
MALWARE_SCANNER_TOKEN=${scannerToken}
MAX_SCAN_BYTES=15728640

# Optional. Leave blank until you configure the provider in Talent Admin.
GOOGLE_OIDC_CLIENT_SECRET=
MICROSOFT_OIDC_CLIENT_SECRET=
`;
const operator=`# Generated locally. Never commit or paste into chat.
DATABASE_RUNTIME_PASSWORD=${dbPassword}
CAREERS_ROUTING_SECRET=${routingSecret}
`;
const runtimePath=path.join(outDir,`runtime.${environment}.env`),operatorPath=path.join(outDir,`github.${environment}.secrets`);
await fs.writeFile(runtimePath,runtime,{mode:0o600});await fs.writeFile(operatorPath,operator,{mode:0o600});
console.log("Created:");
console.log("  "+runtimePath+"  -> GitHub environment secret RUNTIME_ENV_FILE after filling provider placeholders");
console.log("  "+operatorPath+" -> copy DATABASE_RUNTIME_PASSWORD and CAREERS_ROUTING_SECRET into GitHub environment secrets");
console.log("These files are ignored by Git and contain secrets. Do not share them.");
