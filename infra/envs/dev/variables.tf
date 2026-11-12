variable "region" {
  type = string
  default = "ap-southeast-2"
}

variable "name_prefix" {
  type = string
  default = "bdsmini-dev"
}

variable "state_bucket_name" {
  type = string
}

variable "lock_table_name" {
  type = string
}

variable "github_repository" {
  type = string
}

variable "create_github_oidc_provider" {
  type = bool
  default = true
}

variable "alert_email" {
    type = string
}

variable "grafana_url" {
    type = string
}

variable "grafana_otlp_endpoint" {
    type = string
    description = "Grafana Cloud OTLP gateway URL, e.g. https://otlp-gateway-prod-au-southeast-1.grafana.net/otlp"
}

variable "grafana_service_account_token" {
    type = string
    sensitive = true
}

variable "prometheus_datasource_uid" {
  type = string
  default = "grafanacloud-prom"
}

variable "cognito_domain_prefix" {
  type = string
  default = null
}

variable "local_dev_origin" {
  type = string
  default = "http://localhost:5173"
}

variable "custom_domain" {
  type = string
  default = null
}

variable "acm_certificate_arn" {
  type = string
  default = null
}

variable "api_throttling_rate_limit" {
  type = number
  default = 10
}

variable "api_throttling_burst_limit" {
  type = number
  default = 20
}

variable "enable_api_access_log" {
  type = bool
  default = false
}