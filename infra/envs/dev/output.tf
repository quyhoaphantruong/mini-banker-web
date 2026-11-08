output "site_url" {
  value = module.static_site.site_url
}

output "site_bucket" {
  value = module.static_site.bucket_name
}

output "distribution_id" {
  value = module.static_site.distribution_id
}

output "api_endpoint" {
  value = module.api.api_endpoint
}

output "cognito_user_pool_id" {
  value = module.cognito.user_pool_id
}

output "cognito_client_id" {
  value = module.cognito.client_id
}

output "cognito_hosted_ui_url" {
  value = module.cognito.hosted_ui_url
}

output "table_name" {
  value = module.dynamodb.table_name
}

output "lambda_function_names" {
  value = [for fn in module.lambda.functions : fn.function_name]
}

output "otlp_token_parameter_name" {
  value = module.obserability.otlp_token_parameter_name
}

output "github_deploy_role_arn" {
  value = module.github_oidc.deploy_role_arn
}