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

variable "cloudflare_zone_name" {
  type        = string
  default     = "theraeburngroup.com"
  description = "Canonical Cloudflare DNS zone for Raeburn Talent public hostnames."
}

variable "ssh_key_fingerprints" {
  type = list(string)
  validation {
    condition     = length(var.ssh_key_fingerprints) > 0
    error_message = "At least one approved SSH key fingerprint is required."
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


variable "owner" {
  type    = string
  default = "raeburn-talent"
}

variable "cost_centre" {
  type    = string
  default = "recruitment-platform"
}

variable "project_description" {
  type    = string
  default = "Raeburn Talent recruitment platform"
}

variable "alert_emails" {
  type        = list(string)
  default     = []
  description = "Operational alert recipients. Empty disables provider-level email alerts."
}

variable "alert_cpu_threshold" {
  type    = number
  default = 85
}

variable "alert_window" {
  type    = string
  default = "5m"
}


variable "enable_provider_email_alerts" {
  type        = bool
  default     = false
  description = "Create DigitalOcean email alert policies only after the configured alert addresses are verified in DigitalOcean."
}
