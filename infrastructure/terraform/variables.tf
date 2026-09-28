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
  type    = list(string)
  default = []
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
