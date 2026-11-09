variable "name_prefix" {
  type = string
}

variable "domain_prefix" {
  type = string
}

variable "callback_urls" {
  type = list(string)
}

variable "logout_urls" {
  type = list(string)
}

variable "banker_group" {
  type = string
}

data "aws_region" "current" {}

resource "aws_cognito_user_pool" "this" {
  name = "${var.name_prefix}-users"
  mfa_configuration = "OPTIONAL"
  auto_verified_attributes = ["email"]
  username_attributes = [ "email" ]
  deletion_protection = "INACTIVE"

  admin_create_user_config {
    allow_admin_create_user_only = true
  }
  
  password_policy {
    minimum_length = 14
    require_lowercase = true
    require_uppercase = true 
    require_numbers = true 
    require_symbols = true 
    temporary_password_validity_days = 3
  }

  software_token_mfa_configuration {
    enabled = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name = "verified_email"
      priority = 1
    }
  }
}

resource "aws_cognito_user_pool_domain" "this" {
  domain = var.domain_prefix
  user_pool_id = aws_cognito_user_pool.this.id
}

resource "aws_cognito_user_pool_client" "spa" {
  name = "${var.name_prefix}-spa"
  user_pool_id = aws_cognito_user_pool.this.id
  generate_secret = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows = ["code"]
  allowed_oauth_scopes = ["openid", "email", "profile"]
  supported_identity_providers = ["COGNITO"]
  callback_urls = var.callback_urls
  logout_urls = var.logout_urls
  explicit_auth_flows = ["ALLOW_REFRESH_TOKEN_AUTH"]
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation = true
  access_token_validity = 60
  id_token_validity = 60
  refresh_token_validity = 8

  token_validity_units {
    access_token = "minutes"
    id_token = "minutes"
    refresh_token = "hours"
  }
}


resource "aws_cognito_user_group" "banker" {
  name = var.banker_group
  user_pool_id = aws_cognito_user_pool.this.id
}

output "issuer_url" {
  value = "https://cognito-idp.${data.aws_region.current.name}.amazonaws.com/${aws_cognito_user_pool.this.id}"
}

output "client_id" {
  value = aws_cognito_user_pool_client.spa.id
}

output "user_pool_id" {
  value = aws_cognito_user_pool.this.id
}

output "user_pool_arn" {
  value = aws_cognito_user_pool.this.arn
}

output "hosted_ui_url" {
  value = "https://${aws_cognito_user_pool_domain.this.domain}.auth.${data.aws_region.current.name}.amazoncognito.com"
}