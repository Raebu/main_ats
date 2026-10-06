data "cloudflare_ip_ranges" "edge" {}

data "cloudflare_zone" "primary" {
  name       = var.cloudflare_zone_name
  account_id = var.cloudflare_account_id
}

locals {
  prefix = "raeburn-talent-${var.environment}"
  tags = [
    "raeburn-talent",
    "env:${var.environment}",
    "owner:${var.owner}",
    "cost-centre:${var.cost_centre}",
  ]
}

resource "digitalocean_vpc" "platform" {
  name     = "${local.prefix}-vpc"
  region   = var.region
  ip_range = var.environment == "production" ? "10.41.0.0/20" : "10.42.0.0/20"
}

resource "digitalocean_database_cluster" "postgres" {
  name                 = "${local.prefix}-postgres"
  engine               = "pg"
  version              = "17"
  size                 = var.postgres_size
  region               = var.region
  node_count           = var.postgres_nodes
  private_network_uuid = digitalocean_vpc.platform.id
  tags                 = local.tags
}

resource "digitalocean_droplet" "runtime" {
  name       = "${local.prefix}-runtime"
  image      = "ubuntu-24-04-x64"
  region     = var.region
  size       = var.runtime_size
  vpc_uuid   = digitalocean_vpc.platform.id
  ssh_keys   = var.ssh_key_fingerprints
  monitoring = true
  backups    = true
  tags       = local.tags

  user_data = <<-EOF
    #!/bin/bash
    set -eux
    apt-get update
    apt-get install -y docker.io docker-compose-v2 ca-certificates curl
    systemctl enable --now docker
    mkdir -p /opt/raeburn-talent
  EOF
}

resource "digitalocean_droplet" "nats" {
  name       = "${local.prefix}-nats"
  image      = "ubuntu-24-04-x64"
  region     = var.region
  size       = var.nats_size
  vpc_uuid   = digitalocean_vpc.platform.id
  ssh_keys   = var.ssh_key_fingerprints
  monitoring = true
  backups    = true
  tags       = local.tags

  user_data = <<-EOF
    #!/bin/bash
    set -eux
    apt-get update
    apt-get install -y docker.io
    mkdir -p /var/lib/nats
    docker run -d --restart=always --name nats -p 4222:4222 -p 8222:8222 -v /var/lib/nats:/data nats:2-alpine -js -sd /data -m 8222
  EOF
}

resource "digitalocean_firewall" "runtime" {
  name        = "${local.prefix}-runtime-fw"
  droplet_ids = [digitalocean_droplet.runtime.id]

  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = [digitalocean_vpc.platform.ip_range]
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "80"
    source_addresses = concat(data.cloudflare_ip_ranges.edge.ipv4_cidr_blocks, data.cloudflare_ip_ranges.edge.ipv6_cidr_blocks)
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = concat(data.cloudflare_ip_ranges.edge.ipv4_cidr_blocks, data.cloudflare_ip_ranges.edge.ipv6_cidr_blocks)
  }

  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = [digitalocean_vpc.platform.ip_range]
  }

  # trivy:ignore:DIG-0003 -- internet destination is required; egress is restricted to this single protocol/port only.
  outbound_rule {
    protocol              = "tcp"
    port_range            = "53"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  # trivy:ignore:DIG-0003 -- internet destination is required; egress is restricted to this single protocol/port only.
  outbound_rule {
    protocol              = "udp"
    port_range            = "53"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  # trivy:ignore:DIG-0003 -- internet destination is required; egress is restricted to this single protocol/port only.
  outbound_rule {
    protocol              = "tcp"
    port_range            = "80"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  # trivy:ignore:DIG-0003 -- internet destination is required; egress is restricted to this single protocol/port only.
  outbound_rule {
    protocol              = "tcp"
    port_range            = "443"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  # trivy:ignore:DIG-0003 -- internet destination is required; egress is restricted to this single protocol/port only.
  outbound_rule {
    protocol              = "tcp"
    port_range            = "587"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}

resource "digitalocean_firewall" "nats" {
  name        = "${local.prefix}-nats-fw"
  droplet_ids = [digitalocean_droplet.nats.id]

  inbound_rule {
    protocol         = "tcp"
    port_range       = "4222"
    source_addresses = [digitalocean_vpc.platform.ip_range]
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "8222"
    source_addresses = [digitalocean_vpc.platform.ip_range]
  }

  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = [digitalocean_vpc.platform.ip_range]
  }
}

resource "cloudflare_r2_bucket" "documents" {
  account_id = var.cloudflare_account_id
  name       = "${local.prefix}-documents"
  location   = "WEUR"
}

resource "cloudflare_record" "api" {
  zone_id = data.cloudflare_zone.primary.id
  name    = var.environment == "production" ? "api.talent" : "api.staging.talent"
  type    = "A"
  content = digitalocean_droplet.runtime.ipv4_address
  proxied = true
}

resource "cloudflare_record" "hooks" {
  zone_id = data.cloudflare_zone.primary.id
  name    = var.environment == "production" ? "hooks.talent" : "hooks.staging.talent"
  type    = "A"
  content = digitalocean_droplet.runtime.ipv4_address
  proxied = true
}

resource "cloudflare_record" "talent_admin" {
  zone_id = data.cloudflare_zone.primary.id
  name    = var.environment == "production" ? "talent" : "talent.staging"
  type    = "CNAME"
  content = "cname.vercel-dns.com"
  proxied = false
}

resource "cloudflare_record" "careers" {
  zone_id = data.cloudflare_zone.primary.id
  name    = var.environment == "production" ? "careers" : "careers.staging"
  type    = "CNAME"
  content = "cname.vercel-dns.com"
  proxied = false
}

resource "cloudflare_ruleset" "talent_waf" {
  zone_id     = var.cloudflare_zone_id
  name        = "${local.prefix}-waf"
  description = "Raeburn Talent production edge protections"
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  rules {
    action      = "block"
    expression  = "(http.request.method in {\"TRACE\" \"TRACK\"})"
    description = "Block unsafe HTTP methods"
    enabled     = true
  }

  rules {
    action      = "block"
    expression  = "(lower(http.request.uri.path) contains \"/.env\" or lower(http.request.uri.path) contains \"/.git\" or lower(http.request.uri.path) contains \"/wp-admin\" or lower(http.request.uri.path) contains \"/phpmyadmin\")"
    description = "Block common secret and exploit probes"
    enabled     = true
  }
}


resource "digitalocean_monitor_alert" "runtime_cpu" {
  count       = var.enable_provider_email_alerts && length(var.alert_emails) > 0 ? 1 : 0
  type        = "v1/insights/droplet/cpu"
  description = "${local.prefix} runtime CPU"
  compare     = "GreaterThan"
  value       = var.alert_cpu_threshold
  window      = var.alert_window
  enabled     = true
  entities    = [digitalocean_droplet.runtime.id]

  alerts {
    email = var.alert_emails
  }
}

resource "digitalocean_monitor_alert" "nats_cpu" {
  count       = var.enable_provider_email_alerts && length(var.alert_emails) > 0 ? 1 : 0
  type        = "v1/insights/droplet/cpu"
  description = "${local.prefix} NATS CPU"
  compare     = "GreaterThan"
  value       = var.alert_cpu_threshold
  window      = var.alert_window
  enabled     = true
  entities    = [digitalocean_droplet.nats.id]

  alerts {
    email = var.alert_emails
  }
}
