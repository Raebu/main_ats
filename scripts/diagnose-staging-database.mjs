import fs from "node:fs/promises";
import { X509Certificate } from "node:crypto";
import { execFileSync } from "node:child_process";
import pg from "pg";
const token = process.env.DIGITALOCEAN_TOKEN;
if (!token) throw new Error("DigitalOcean token is unavailable");
const run = args => execFileSync("doctl", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const clusters = JSON.parse(run(["databases", "list", "--output", "json"]));
const matches = clusters.filter(x => x.name === "raeburn-talent-staging-postgres");
if (matches.length !== 1) throw new Error("Expected exactly one staging PostgreSQL cluster");
const id = matches[0].id;
function shape(value, path = "$", depth = 0) {
  const type = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  const item = { path, type };
  if (typeof value === "string") item.length = value.length;
  console.log(JSON.stringify(item));
  if (depth < 5 && value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) shape(child, path + "." + key, depth + 1);
  }
}
function inspect(value, path = "$", found = []) {
  if (typeof value === "string" && value.length > 100) {
    const candidates = [
      ["PEM", value.trim()],
      ["escaped-PEM", value.replace(/\\n/g, "\n").trim()],
      ["base64", Buffer.from(value.replace(/\s+/g, ""), "base64")],
    ];
    for (const [representation, candidate] of candidates) {
      try {
        const cert = new X509Certificate(candidate);
        console.log(JSON.stringify({ path, representation, x509Valid: true, isCA: cert.ca }));
        found.push(cert);
        break;
      } catch { /* Never log parser input or response values. */ }
    }
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) inspect(child, path + "." + key, found);
  }
  return found;
}
const response = await fetch("https://api.digitalocean.com/v2/databases/" + encodeURIComponent(id) + "/ca", {
  headers: { Authorization: "Bearer " + token, Accept: "application/json" },
  signal: AbortSignal.timeout(30000),
});
console.log(JSON.stringify({ source: "raw-api", status: response.status, contentType: response.headers.get("content-type") }));
if (!response.ok) throw new Error("CA API request failed with HTTP " + response.status);
const payload = await response.json();
shape(payload);
const certificates = inspect(payload);
let cli;
try { cli = JSON.parse(run(["databases", "get-ca", id, "--output", "json"])); }
catch { throw new Error("doctl CA query or JSON decoding failed (raw output suppressed)"); }
console.log("doctl response structure:");
shape(cli);
inspect(cli);
if (certificates.length !== 1 || !certificates[0].ca) throw new Error("Expected exactly one valid API CA certificate");
const pem = certificates[0].toString() + "\n";
const caFile = process.env.RUNNER_TEMP + "/diagnostic-postgres-ca.pem";
await fs.writeFile(caFile, pem, { mode: 0o600 });
execFileSync("openssl", ["x509", "-in", caFile, "-noout"], { stdio: ["ignore", "pipe", "pipe"] });
console.log("OpenSSL and Node X509Certificate validation passed");
const uri = run(["databases", "connection", id, "--format", "URI", "--no-header"]).trim();
console.log("::add-mask::" + uri);
const url = new URL(uri);
for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) url.searchParams.delete(key);
const client = new pg.Client({
  connectionString: url.toString(),
  ssl: { ca: pem, rejectUnauthorized: true },
  connectionTimeoutMillis: 15000,
  query_timeout: 15000,
});
try {
  await client.connect();
  const result = await client.query("select ssl from pg_stat_ssl where pid = pg_backend_pid()");
  if (result.rows[0]?.ssl !== true || client.connection.stream.authorized !== true) throw new Error("TLS verification not confirmed");
  console.log("Read-only PostgreSQL connection passed; TLS encrypted and certificate authorized");
} catch (error) {
  throw new Error("PostgreSQL diagnostic failed; code=" + (error.code || error.name));
} finally {
  await client.end().catch(() => {});
  await fs.rm(caFile, { force: true });
}
