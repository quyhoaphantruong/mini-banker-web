provider "aws" {
  region = var.region

  default_tags {
    tags = {
      project     = "mini-banker-desktop"
      environment = "dev"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id

  # Bundles from backend/scripts/build.mjs. Run `npm run build -w backend` before plan.
  backend_dist_dir = abspath("${path.root}/../../../backend/dist")

  # Must not contain "aws", "amazon" or "cognito". Globally unique per region.
  cognito_domain_prefix = coalesce(var.cognito_domain_prefix, "${var.name_prefix}-${local.account_id}")

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

module "lambda" {
  source         = "../../modules/lambda"
  name_prefix    = var.name_prefix
  dist_dir       = local.backend_dist_dir
  table_name     = module.dynamodb.table_name
  table_arn      = module.dynamodb.table_arn
  index_arns     = module.dynamodb.index_arns
  enable_tracing = var.enable_tracing
  functions      = local.functions
}

# CloudWatch alarms, dashboard and the SNS alert topic. Metrics and logs flow regardless of this flag.
module "observability" {
  count          = var.enable_observability ? 1 : 0
  source         = "../../modules/observability"
  name_prefix    = var.name_prefix
  region         = var.region
  alert_email    = var.alert_email
  function_names = { for k, fn in module.lambda.functions : k => fn.function_name }
  api_id         = module.api.api_id
  table_name     = module.dynamodb.table_name
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
  cors_allow_origins     = var.enable_cloudfront ? [] : [var.local_dev_origin]
}

module "static_site" {
  source                = "../../modules/static_site"
  name_prefix           = var.name_prefix
  region                = var.region
  enable_cloudfront     = var.enable_cloudfront
  local_origin          = var.local_dev_origin
  api_endpoint          = module.api.api_endpoint
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
  auth_mode            = var.github_auth_mode
  create_oidc_provider = var.create_github_oidc_provider
  state_bucket_arn     = local.state_bucket_arn
  lock_table_arn       = local.lock_table_arn
  site_bucket_arn      = module.static_site.bucket_arn
  distribution_arn     = module.static_site.distribution_arn
  lambda_function_arns = [for fn in module.lambda.functions : fn.arn]
}
