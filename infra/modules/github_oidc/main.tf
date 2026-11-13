variable "name_prefix" {
  type = string
}

variable "github_repository" {
  type        = string
  description = "owner/repo allowed to assume the deploy role."
}

variable "github_environment" {
  type        = string
  default     = "dev"
  description = "GitHub environment the deploy job uses. A job with an environment gets the OIDC subject repo:<repo>:environment:<name>."
}

variable "auth_mode" {
  type        = string
  default     = "oidc"
  description = "oidc = OIDC provider plus assumable role. iam_user = IAM user whose access keys go in GitHub secrets (use when an SCP blocks the OIDC provider)."

  validation {
    condition     = contains(["oidc", "iam_user"], var.auth_mode)
    error_message = "auth_mode must be oidc or iam_user."
  }
}

variable "create_oidc_provider" {
  type        = bool
  default     = true
  description = "The provider is one per account. Set false when it already exists."
}

variable "state_bucket_arn" {
  type = string
}

variable "lock_table_arn" {
  type = string
}

variable "site_bucket_arn" {
  type = string
}

variable "distribution_arn" {
  type    = string
  default = null
}

variable "lambda_function_arns" {
  type = list(string)
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.name
  oidc_url   = "token.actions.githubusercontent.com"
}

resource "aws_iam_openid_connect_provider" "github" {
  count           = var.auth_mode == "oidc" && var.create_oidc_provider ? 1 : 0
  url             = "https://${local.oidc_url}"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_openid_connect_provider" "existing" {
  count = var.auth_mode == "oidc" && !var.create_oidc_provider ? 1 : 0
  url   = "https://${local.oidc_url}"
}

locals {
  provider_arn = var.auth_mode != "oidc" ? null : (var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : data.aws_iam_openid_connect_provider.existing[0].arn)
}

data "aws_iam_policy_document" "trust" {
  count = var.auth_mode == "oidc" ? 1 : 0

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_url}:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_url}:sub"
      values   = ["repo:${var.github_repository}:environment:${var.github_environment}"]
    }
  }
}

resource "aws_iam_role" "deploy" {
  count                = var.auth_mode == "oidc" ? 1 : 0
  name                 = "${var.name_prefix}-github-deploy"
  assume_role_policy   = data.aws_iam_policy_document.trust[0].json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "deploy" {
  statement {
    sid       = "TerraformStateObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${var.state_bucket_arn}/*"]
  }

  statement {
    sid       = "TerraformStateBucket"
    actions   = ["s3:ListBucket", "s3:GetBucketVersioning"]
    resources = [var.state_bucket_arn]
  }

  statement {
    sid       = "TerraformStateLock"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem", "dynamodb:DescribeTable"]
    resources = [var.lock_table_arn]
  }

  statement {
    sid       = "SiteBucketObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:GetObjectTagging", "s3:PutObjectTagging"]
    resources = ["${var.site_bucket_arn}/*"]
  }

  statement {
    sid       = "SiteBucketManage"
    actions   = ["s3:ListBucket", "s3:Get*", "s3:PutBucketPolicy", "s3:PutBucketPublicAccessBlock", "s3:PutEncryptionConfiguration"]
    resources = [var.site_bucket_arn]
  }

  dynamic "statement" {
    for_each = var.distribution_arn != null ? [1] : []

    content {
      sid       = "InvalidateSiteCache"
      actions   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation", "cloudfront:GetDistribution", "cloudfront:UpdateDistribution"]
      resources = [var.distribution_arn]
    }
  }

  statement {
    sid       = "UpdateLambdaCode"
    actions   = ["lambda:UpdateFunctionCode", "lambda:UpdateFunctionConfiguration", "lambda:Get*", "lambda:List*"]
    resources = var.lambda_function_arns
  }

  # terraform plan refreshes the deploy identity itself. It can read but not change its own policy,
  # so edits to this document must be applied locally with admin credentials.
  statement {
    sid       = "ReadDeployIdentity"
    actions   = ["iam:GetUser", "iam:ListAttachedUserPolicies", "iam:ListUserPolicies", "iam:GetPolicy", "iam:GetPolicyVersion", "iam:ListPolicyVersions", "iam:ListPolicyTags"]
    resources = ["arn:aws:iam::${local.account_id}:user/${var.name_prefix}-*", "arn:aws:iam::${local.account_id}:policy/${var.name_prefix}-*"]
  }

  # These actions do not support resource-level permissions.
  statement {
    sid       = "ReadUnscoped"
    actions   = ["logs:DescribeLogGroups", "cognito-idp:DescribeUserPoolDomain"]
    resources = ["*"]
  }

  statement {
    sid       = "ManageProjectRoles"
    actions   = ["iam:GetRole", "iam:GetRolePolicy", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies", "iam:PutRolePolicy", "iam:DeleteRolePolicy"]
    resources = ["arn:aws:iam::${local.account_id}:role/${var.name_prefix}-*"]
  }

  statement {
    sid       = "ManageProjectTable"
    actions   = ["dynamodb:DescribeTable", "dynamodb:DescribeContinuousBackups", "dynamodb:DescribeTimeToLive", "dynamodb:UpdateTable", "dynamodb:TagResource", "dynamodb:UntagResource", "dynamodb:ListTagsOfResource"]
    resources = ["arn:aws:dynamodb:${local.region}:${local.account_id}:table/bdsmini*"]
  }

  statement {
    sid       = "ManageProjectApi"
    actions   = ["apigateway:GET", "apigateway:POST", "apigateway:PUT", "apigateway:PATCH", "apigateway:DELETE"]
    resources = ["arn:aws:apigateway:${local.region}::/apis", "arn:aws:apigateway:${local.region}::/apis/*", "arn:aws:apigateway:${local.region}::/apis/*/routes", "arn:aws:apigateway:${local.region}::/apis/*/stages"]
  }

  statement {
    sid       = "ManageProjectUserPool"
    actions   = ["cognito-idp:Describe*", "cognito-idp:Get*", "cognito-idp:List*", "cognito-idp:UpdateUserPool", "cognito-idp:SetUserPoolMfaConfig"]
    resources = ["arn:aws:cognito-idp:${local.region}:${local.account_id}:userpool/*"]
  }

  statement {
    sid       = "ManageProjectLogGroups"
    actions   = ["logs:DescribeLogGroups", "logs:ListTagsForResource", "logs:PutRetentionPolicy"]
    resources = ["arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${var.name_prefix}-*", "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/http-api/${var.name_prefix}-*"]
  }

  statement {
    sid       = "ManageProjectParameters"
    actions   = ["ssm:GetParameter", "ssm:GetParameters", "ssm:PutParameter", "ssm:ListTagsForResource", "ssm:AddTagsToResource"]
    resources = ["arn:aws:ssm:${local.region}:${local.account_id}:parameter/${var.name_prefix}/*"]
  }

  statement {
    sid       = "ManageCloudFrontPolicies"
    actions   = ["cloudfront:Get*", "cloudfront:List*", "cloudfront:DescribeFunction", "cloudfront:UpdateFunction", "cloudfront:CreateFunction"]
    resources = ["arn:aws:cloudfront::${local.account_id}:function/${var.name_prefix}-*", "arn:aws:cloudfront::${local.account_id}:response-headers-policy/*"]
  }

  statement {
    sid       = "ReadCloudFrontManagedPolicies"
    actions   = ["cloudfront:ListCachePolicies", "cloudfront:ListOriginRequestPolicies", "cloudfront:GetCachePolicy", "cloudfront:GetOriginRequestPolicy"]
    resources = ["*"]
  }

  statement {
    sid       = "ReadCallerIdentity"
    actions   = ["sts:GetCallerIdentity"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "deploy" {
  count  = var.auth_mode == "oidc" ? 1 : 0
  name   = "deploy"
  role   = aws_iam_role.deploy[0].id
  policy = data.aws_iam_policy_document.deploy.json
}

# IAM user mode. Create the access key by hand (console or `aws iam create-access-key`) so the secret never enters Terraform state.
resource "aws_iam_user" "deploy" {
  count = var.auth_mode == "iam_user" ? 1 : 0
  name  = "${var.name_prefix}-github-deploy"
}

# A managed policy (6144 byte limit) because inline user policies are capped at 2048 bytes.
resource "aws_iam_policy" "deploy" {
  count  = var.auth_mode == "iam_user" ? 1 : 0
  name   = "${var.name_prefix}-github-deploy"
  policy = data.aws_iam_policy_document.deploy.json
}

resource "aws_iam_user_policy_attachment" "deploy" {
  count      = var.auth_mode == "iam_user" ? 1 : 0
  user       = aws_iam_user.deploy[0].name
  policy_arn = aws_iam_policy.deploy[0].arn
}

output "deploy_role_arn" {
  value = var.auth_mode == "oidc" ? aws_iam_role.deploy[0].arn : null
}

output "deploy_user_name" {
  value = var.auth_mode == "iam_user" ? aws_iam_user.deploy[0].name : null
}
