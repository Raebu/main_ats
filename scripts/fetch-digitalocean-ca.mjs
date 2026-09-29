import fs from "node:fs/promises";
import { X509Certificate } from "node:crypto";

const [clusterId, outputPath] = process.argv.slice(2);
const token = process.env.DIGITALOCEAN_TOKEN;

if (!clusterId) throw new Error("Database cluster ID is required");
if (!outputPath) throw new Error("Output path is required");
if (!token) throw new Error("DIGITALOCEAN_TOKEN is required");

const response = await fetch(
  `https://api.digitalocean.com/v2/databases/${encodeURIComponent(clusterId)}/ca`,
  { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
);

if (!response.ok) {
  throw new Error(`DigitalOcean CA request failed with HTTP ${response.status}`);
}

const payload = await response.json();
const certificate = payload?.ca?.certificate;
if (typeof certificate !== "string" || !certificate.trim()) {
  throw new Error("DigitalOcean CA response did not contain ca.certificate");
}

const candidates = [
  certificate.trim(),
  certificate.replace(/\\n/g, "\n").trim(),
];

const compact = certificate.replace(/\s+/g, "");
if (compact) {
  candidates.push(Buffer.from(compact, "base64"));
}

let parsed;
for (const candidate of candidates) {
  try {
    parsed = new X509Certificate(candidate);
    break;
  } catch {
    // Try the next documented/legacy representation.
  }
}

if (!parsed) {
  throw new Error("DigitalOcean CA could not be parsed as PEM, escaped PEM, or base64 DER/PEM");
}

const pem = parsed.toString();
if (!pem.includes("BEGIN CERTIFICATE") || !pem.includes("END CERTIFICATE")) {
  throw new Error("Normalized certificate is not PEM");
}

await fs.writeFile(outputPath, pem.endsWith("\n") ? pem : pem + "\n", { mode: 0o600 });
console.log("DigitalOcean managed PostgreSQL CA normalized to PEM");
