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
  default     = true
  description = "Serve the SPA and API through CloudFront. Needs AWS account verification (done for this account). Default true so CI applies keep the distribution. When false the SPA runs from local_dev_origin and calls the API directly."
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
  default     = true
  description = "Create the CloudWatch dashboard, alarms and SNS alert topic (modules/observability). Needs the deploy policy from modules/github_oidc applied first with admin credentials."
}

variable "enable_tracing" {
  type        = bool
  default     = true
  description = "X-Ray active tracing on the Lambdas."
}

variable "alert_email" {
  type        = string
  default     = ""
  description = "Alarm notifications. Empty means alarms fire but nobody is emailed."
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