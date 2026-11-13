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

variable "enable_cloudfront" {
  type        = bool
  default     = false
  description = "Serve the SPA and API through CloudFront. Needs AWS account verification. When false the SPA runs from local_dev_origin and calls the API directly."
}

variable "github_auth_mode" {
  type        = string
  default     = "iam_user"
  description = "oidc or iam_user. See modules/github_oidc."
}

variable "create_github_oidc_provider" {
  type = bool
  default = true
}

variable "enable_observability" {
  type        = bool
  default     = false
  description = "Create the Grafana Cloud dashboards/alerts and send OTLP telemetry. When false, none of the grafana_* variables are needed."
}

variable "alert_email" {
    type    = string
    default = ""
}

# Placeholder defaults keep the grafana provider configurable when observability is off.
variable "grafana_url" {
    type    = string
    default = "http://localhost:3000"
}

variable "grafana_otlp_endpoint" {
    type = string
    default = ""
    description = "Grafana Cloud OTLP gateway URL, e.g. https://otlp-gateway-prod-au-southeast-1.grafana.net/otlp"
}

variable "grafana_service_account_token" {
    type = string
    default = "unused"
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