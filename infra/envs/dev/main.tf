provider "aws" {
  region = var.region

  default_tags {
    tags = {
      project     = "mini-banker-desktop"
      environment = "dev"
    }
  }
}

provider "grafana" {
  url  = var.grafana_url
  auth = var.grafana_service_account_token
}

data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id

  # Bundles from backend/scripts/build.mjs. Run `npm run build -w backend` before plan.
  backend_dist_dir = abspath("${path.root}/../../../backend/dist")

  # Must not contain "aws", "amazon" or "cognito". Globally unique per region.
  cognito_domain_prefix = coalesce(var.cognito_domain_prefix, "${var.name_prefix}-${local.account_id}")

  # Under /<name_prefix>/ so the GitHub deploy role can manage it.
  otlp_token_parameter_name = "/${var.name_prefix}/otlp-token"

  # Bootstrap creates these; envs/dev only needs their ARNs for the deploy role.
  state_bucket_arn = "arn:aws:s3:::${var.state_bucket_name}"
  lock_table_arn   = "arn:aws:dynamodb:${var.region}:${local.account_id}:table/${var.lock_table_name}"

  read_actions = ["dynamodb:GetItem", "dynamodb:Query"]

  # Least privilege per bundle. Cancel is a TransactWriteItems of one Update and two Puts.
  functions = {
    launch = {
      dist_file     = "launch.mjs"
      table_actions = []
      index_names   = []
    }
    customers = {
      dist_file     = "customers.mjs"
      table_actions = local.read_actions
      index_names   = ["GSI1"]
    }
    mandates = {
      dist_file     = "mandates.mjs"
      table_actions = concat(local.read_actions, ["dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:ConditionCheckItem"])
      index_names   = ["GSI2"]
    }
  }

  # Mirrors ROUTES in shared/src/api.ts and the route tables in backend/src/handlers.
  routes = {
    "GET /api/launch"                         = "launch"
    "POST /api/customers/search"              = "customers"
    "GET /api/customers/{capId}"              = "customers"
    "GET /api/customers/{capId}/accounts"     = "customers"
    "GET /api/customers/{capId}/mandates"     = "mandates"
    "GET /api/mandates/{id}"                  = "mandates"
    "GET /api/mandates/{id}/events"           = "mandates"
    "GET /api/mandates/{id}/transactions"     = "mandates"
    "POST /api/mandates/{id}/cancel"          = "mandates"
  }
}

module "dynamodb" {
  source     = "../../modules/dynamodb"
  table_name = var.name_prefix
}

module "observability" {
  source                    = "../../modules/observability"
  name_prefix               = var.name_prefix
  alert_email               = var.alert_email
  prometheus_datasource_uid = var.prometheus_datasource_uid
  otlp_token_parameter_name = local.otlp_token_parameter_name
}

module "lambda" {
  source                   = "../../modules/lambda"
  name_prefix              = var.name_prefix
  dist_dir                 = local.backend_dist_dir
  table_name               = module.dynamodb.table_name
  table_arn                = module.dynamodb.table_arn
  index_arns               = module.dynamodb.index_arns
  otlp_endpoint            = var.grafana_otlp_endpoint
  otel_auth_parameter_name = module.observability.otlp_token_parameter_name
  otel_auth_parameter_arn  = module.observability.otlp_token_parameter_arn
  functions                = local.functions
}

module "cognito" {
  source        = "../../modules/cognito"
  name_prefix   = var.name_prefix
  domain_prefix = local.cognito_domain_prefix
  banker_group  = "banker" # BANKER_GROUP in shared/src/api.ts
  callback_urls = ["${module.static_site.site_url}/", "${var.local_dev_origin}/"]
  logout_urls   = ["${module.static_site.site_url}/", "${var.local_dev_origin}/"]
}

module "api" {
  source                 = "../../modules/api"
  name_prefix            = var.name_prefix
  jwt_issuer             = module.cognito.issuer_url
  jwt_audience           = [module.cognito.client_id]
  functions              = module.lambda.functions
  routes                 = local.routes
  throttling_rate_limit  = var.api_throttling_rate_limit
  throttling_burst_limit = var.api_throttling_burst_limit
  enable_access_logs     = var.enable_api_access_log
}

module "static_site" {
  source                = "../../modules/static_site"
  name_prefix           = var.name_prefix
  region                = var.region
  api_domain_name       = module.api.api_domain_name
  oidc_authority        = module.cognito.issuer_url
  oidc_client_id        = module.cognito.client_id
  cognito_hosted_ui_url = module.cognito.hosted_ui_url
  custom_domain         = var.custom_domain
  acm_certificate_arn   = var.acm_certificate_arn
}

module "github_oidc" {
  source               = "../../modules/github_oidc"
  name_prefix          = var.name_prefix
  github_repository    = var.github_repository
  create_oidc_provider = var.create_github_oidc_provider
  state_bucket_arn     = local.state_bucket_arn
  lock_table_arn       = local.lock_table_arn
  site_bucket_arn      = module.static_site.bucket_arn
  distribution_arn     = module.static_site.distribution_arn
  lambda_function_arns = [for fn in module.lambda.functions : fn.arn]
}
