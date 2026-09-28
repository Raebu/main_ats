output "runtime_ipv4" {
  value = digitalocean_droplet.runtime.ipv4_address
}

output "nats_private_ipv4" {
  value = digitalocean_droplet.nats.ipv4_address_private
}

output "postgres_private_host" {
  value     = digitalocean_database_cluster.postgres.private_host
  sensitive = true
}

output "postgres_port" {
  value = digitalocean_database_cluster.postgres.port
}

output "documents_bucket" {
  value = cloudflare_r2_bucket.documents.name
}

output "api_hostname" {
  value = cloudflare_record.api.hostname
}

output "hooks_hostname" {
  value = cloudflare_record.hooks.hostname
}
