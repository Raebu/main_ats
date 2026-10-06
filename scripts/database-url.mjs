export function serviceDatabaseUrl(baseUrl, service) {
  const url = new URL(baseUrl);
  url.pathname = "/" + String(service).replace(/-/g, "_");
  return url.toString();
}
