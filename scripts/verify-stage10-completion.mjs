import fs from"node:fs";

const failures=[];
function requireFile(path){if(!fs.existsSync(path))failures.push("missing file: "+path);return fs.existsSync(path)?fs.readFileSync(path,"utf8"):"";}
function expectContains(path,patterns){const body=requireFile(path);for(const p of patterns){if(!body.includes(p))failures.push(path+" missing required Stage 10 marker: "+p);}}

if(!fs.existsSync("package-lock.json"))failures.push("package-lock.json must be committed for deterministic npm ci");
expectContains(".github/workflows/ci.yml",[
  "npm ci","workspace-validation","test:integration","test:security-integration","test:failure","test:load",
  "backup-restore","test:e2e","platform:bootstrap"
]);
expectContains(".github/workflows/security.yml",[
  "codeql-action","gitleaks","scan-type: fs","scan-type: config","container-scan","anchore/sbom-action"
]);
expectContains(".github/workflows/release.yml",[
  "Require matching Security workflow success","cosign sign","environment: staging","environment: production",
  "Staging smoke test","Progressive production deployment","Automatic rollback","gh release create"
]);
expectContains(".github/workflows/infrastructure.yml",[
  "tofu fmt -check","tofu -chdir=infrastructure/terraform validate","Plan infrastructure","Apply approved infrastructure","Detect production drift"
]);
expectContains(".github/workflows/dast.yml",["zaproxy/action-baseline","fail_action: true"]);
expectContains(".github/workflows/preview.yml",["Deploy isolated preview"]);
expectContains("infrastructure/terraform/main.tf",[
  "digitalocean_vpc","digitalocean_database_cluster","digitalocean_droplet","cloudflare_r2_bucket",
  "cloudflare_record","digitalocean_firewall","digitalocean_monitor_alert","cost-centre:"
]);
expectContains("tests/e2e/frontends.spec.ts",[
  "AxeBuilder","Application received","Request my data","Withdraw application","Recruitment command centre"
]);
expectContains("scripts/ci-security-isolation.mjs",[
  "authenticated tenant isolation failed","RBAC write denial expected","public tenant spoofing exposed foreign tenant data"
]);
expectContains("scripts/ci-integration-smoke.mjs",[
  "candidatePortalToken","portal DSAR","distribution worker did not publish","JSON distribution feed missing"
]);
expectContains("scripts/validate-migrations.mjs",["missing migrations directory","destructive-approved"]);\nexpectContains("scripts/migrate-services.mjs",["_schema_migrations"]);
expectContains("scripts/release-smoke.mjs",["/health","/v1/jobs/public"]);

if(failures.length){
 console.error("Stage 10 completion gate failed:\n- "+failures.join("\n- "));
 process.exit(1);
}
console.log(JSON.stringify({ok:true,stage:10,gate:"testing-ci-cd-infrastructure",checks:18}));
