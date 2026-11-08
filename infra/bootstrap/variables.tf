variable "region" {
  type = string
  default = "ap-southeast-2"
}

variable "state_bucket_name" {
  type = string
  default = null
  description = "Globally unique. Defaults to bdsmini-tfstate<account id>."
}

variable "lock_table_name" {
  type = string
  default = "bdsmini-tflock"
}

variable "budget_alert_email" {
  type = string
  description = "Receives the 5 and 10 USD budget alerts."
}

variable "budget_limit_usd" {
  type = string
  default = 10
}