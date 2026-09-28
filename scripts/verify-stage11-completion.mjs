import fs from "node:fs";

const checks = [
  ["Administration workspace", "apps/talent-admin/app/administration/page.tsx", ["/v1/workflow/templates","/v1/interviews/templates","/v1/communications/templates","/v1/jobs/templates","/v1/privacy/retention-policies","/v1/careers-gateways","/v1/notifications/admin/policies","/v1/hooks/api-clients","/v1/hooks/subscriptions"]],
  ["Configuration inheritance + rollback", "services/configuration/src/index.ts", ["/v1/config/scoped/:key","/rollback/:version","config_history"]],
  ["Feature experiments + cleanup", "services/feature-flags/src/index.ts", ["/v1/flags/experiments","/v1/flags/stale-cleanup","evaluation_count","experiment_key"]],
  ["Reporting administration", "apps/talent-admin/components/ReportingWorkspace.tsx", ["Scheduled reports","BI / data warehouse connectors","Generated export artifacts","Executive XLSX","Board PDF"]],
  ["Governed reporting API", "services/analytics/src/index.ts", ["/v1/analytics/report-schedules","/v1/analytics/exports","piiMode","/v1/analytics/bi-connectors"]],
  ["Data-quality workflow", "services/analytics/src/index.ts", ["/v1/analytics/data-quality/run","/v1/analytics/data-quality/:id/remediate","DUPLICATE_CANDIDATE_","EVENT_RECONCILIATION_APPLICATION_SHORTFALL"]],
  ["Data-quality admin", "apps/talent-admin/components/DataQualityWorkspace.tsx", ["Run quality audit","Apply safe normalisation fixes","remediated"]],
  ["Design-system component catalogue", "packages/ui/src/components.tsx", ["FormField","DataTable","Drawer","Modal","Toast","BarChart"]],
  ["Live design-system page", "apps/talent-admin/app/design-system/page.tsx", ["Controls","Table","States and notices","@raeburn/ui"]],
  ["Stage 11 reporting tests", "services/analytics/src/reporting.test.ts", ["xlsx","pdf","csv"]],
];

const requiredFiles = [
  "services/workflow/migrations/002_stage11_workflow_templates.sql",
  "services/communications/migrations/002_stage11_templates.sql",
  "services/configuration/migrations/002_stage11_admin_registry.sql",
  "services/feature-flags/migrations/002_stage11_experiments.sql",
  "services/notifications/migrations/002_stage11_admin_policies.sql",
  "services/careers-gateway/migrations/002_stage11_gateway_definitions.sql",
  "services/analytics/migrations/002_stage11_reporting.sql",
  "services/analytics/migrations/003_stage11_data_quality_remediation.sql",
];

const failures = [];
const completed = [];

for (const [name, file, needles] of checks) {
  if (!fs.existsSync(file)) {
    failures.push(`${name}: missing ${file}`);
    continue;
  }
  const source = fs.readFileSync(file, "utf8");
  const missing = needles.filter(needle => !source.includes(needle));
  if (missing.length) failures.push(`${name}: missing ${missing.join(", ")} in ${file}`);
  else completed.push(name);
}

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) failures.push(`Missing Stage 11 migration: ${file}`);
}

const result = {
  stage: 11,
  gate: "administration-reporting-data-quality-design-system",
  status: failures.length ? "FAILED" : "PASSED",
  completed,
  migrations: requiredFiles.length,
  failures,
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
