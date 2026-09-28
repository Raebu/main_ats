variable "environment" {
  type = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production"
  }
}

variable "region" {
  type    = string
  default = "lon1"
}

variable "digitalocean_token" {
  type      = string
  sensitive = true
}

variable "cloudflare_api_token" {
  type      = string
  sensitive = true
}

variable "cloudflare_account_id" {
  type = string
}

variable "cloudflare_zone_id" {
  type = string
}

variable "ssh_key_fingerprints" {
  type = list(string)
  validation {
    condition     = length(var.ssh_key_fingerprints) > 0
    error_message = "At least one approved SSH key fingerprint is required."
  }
}

variable "internet_egress_cidrs" {
  type        = list(string)
  description = "Approved egress proxy/NAT CIDRs. Do not use unrestricted CIDRs in production."
  validation {
    condition     = length(var.internet_egress_cidrs) > 0
    error_message = "At least one approved egress CIDR is required."
  }
}

variable "postgres_size" {
  type    = string
  default = "db-s-1vcpu-1gb"
}

variable "postgres_nodes" {
  type    = number
  default = 1
}

variable "runtime_size" {
  type    = string
  default = "s-2vcpu-4gb"
}

variable "nats_size" {
  type    = string
  default = "s-1vcpu-2gb"
}

variable "owner" {
  type    = string
  default = "raeburn-talent"
}

variable "cost_centre" {
  type    = string
  default = "recruitment-platform"
}
