variable "name_prefix" {
  type = string
}

variable "enable_cloudfront" {
  type    = bool
  default = false
}

variable "local_origin" {
  type        = string
  default     = "http://localhost:5173"
  description = "Where the SPA runs when CloudFront is off."
}

variable "api_endpoint" {
  type        = string
  description = "Full API URL, used as apiBaseUrl when CloudFront is off."
}

variable "api_domain_name" {
  type = string
}

variable "oidc_authority" {
  type = string
}

variable "oidc_client_id" {
  type = string
}

variable "oidc_scope" {
  type    = string
  default = "openid email profile"
}

variable "cognito_hosted_ui_url" {
  type        = string
  description = "Allowed in the CSP connect-src so the SPA can call the token endpoint."
}

variable "region" {
  type = string
}

variable "force_destroy" {
  type    = bool
  default = true
}

variable "custom_domain" {
  type    = string
  default = null
}

variable "acm_certificate_arn" {
  type        = string
  default     = null
  description = "Certificate in us-east-1. Required when custom_domain is set."
}

data "aws_caller_identity" "current" {}

data "aws_cloudfront_cache_policy" "optimized" {
  count = var.enable_cloudfront ? 1 : 0
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "disabled" {
  count = var.enable_cloudfront ? 1 : 0
  name = "Managed-CachingDisabled"
}

# AllViewer forwards Authorization. The Host header is excluded because API Gateway rejects a foreign Host.
data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  count = var.enable_cloudfront ? 1 : 0
  name = "Managed-AllViewerExceptHostHeader"
}

locals {
  site_origin_id = "site"
  api_origin_id  = "api"
  # Without CloudFront the SPA is not hosted in AWS: it runs from var.local_origin and calls the API directly.
  site_url = !var.enable_cloudfront ? var.local_origin : (var.custom_domain != null ? "https://${var.custom_domain}" : "https://${aws_cloudfront_distribution.this[0].domain_name}")
  api_base = var.enable_cloudfront ? "/api" : "${var.api_endpoint}/api"
}

resource "aws_s3_bucket" "site" {
  bucket        = "${var.name_prefix}-site-${data.aws_caller_identity.current.account_id}"
  force_destroy = var.force_destroy
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_cloudfront_origin_access_control" "site" {
  count = var.enable_cloudfront ? 1 : 0
  name                              = "${var.name_prefix}-site"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Client-side routes have no object in S3. Rewriting them here, instead of mapping 403/404 to index.html
# with custom_error_response, keeps API 403/404 responses (forbidden, customer not found) intact.
resource "aws_cloudfront_function" "spa_rewrite" {
  count = var.enable_cloudfront ? 1 : 0
  name    = "${var.name_prefix}-spa-rewrite"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<EOT
function handler(event) {
    var request = event.request;
    var last = request.uri.split('/').pop();
    if (last.indexOf('.') === -1) {
        request.uri = '/index.html';
    }
    return request;
}
EOT
}

resource "aws_cloudfront_response_headers_policy" "security" {
  count = var.enable_cloudfront ? 1 : 0
  name = "${var.name_prefix}-security"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }

    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "DENY"
      override     = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }

    xss_protection {
      protection = true
      mode_block = true
      override   = true
    }

    content_security_policy {
      content_security_policy = join("; ", [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "connect-src 'self' ${var.cognito_hosted_ui_url} https://cognito-idp.${var.region}.amazonaws.com",
        "frame-ancestors 'none'",
        "base-uri 'self'"
      ])
      override = true
    }
  }
}

resource "aws_cloudfront_distribution" "this" {
  count = var.enable_cloudfront ? 1 : 0
  enabled             = true
  comment             = "${var.name_prefix} SPA and API"
  default_root_object = "index.html"
  price_class         = "PriceClass_All"
  http_version        = "http2and3"
  aliases             = var.custom_domain != null ? [var.custom_domain] : []

  origin {
    origin_id                = local.site_origin_id
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.site[0].id
  }

  origin {
    origin_id   = local.api_origin_id
    domain_name = var.api_domain_name

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id           = local.site_origin_id
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized[0].id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security[0].id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_rewrite[0].arn
    }
  }

  ordered_cache_behavior {
    path_pattern               = "/api/*"
    target_origin_id           = local.api_origin_id
    viewer_protocol_policy     = "https-only"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.disabled[0].id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_viewer_except_host[0].id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security[0].id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = var.custom_domain == null
    acm_certificate_arn            = var.custom_domain != null ? var.acm_certificate_arn : null
    ssl_support_method             = var.custom_domain != null ? "sni-only" : null
    minimum_protocol_version       = var.custom_domain != null ? "TLSv1.2_2021" : null
  }
}

data "aws_iam_policy_document" "site_bucket" {
  count = var.enable_cloudfront ? 1 : 0

  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.site.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.this[0].arn]
    }
  }
}

resource "aws_s3_bucket_policy" "site" {
  count  = var.enable_cloudfront ? 1 : 0
  bucket = aws_s3_bucket.site.id
  policy = data.aws_iam_policy_document.site_bucket[0].json
  depends_on = [ aws_s3_bucket_public_access_block.site ]
}

resource "aws_s3_object" "config" {
  bucket        = aws_s3_bucket.site.id
  key           = "config.json"
  content_type  = "application/json"
  cache_control = "no-cache"

  content = jsonencode({
    apiBaseUrl = local.api_base
    devAuth    = false
    oidc = {
      authority   = var.oidc_authority
      clientId    = var.oidc_client_id
      redirectUri = "${local.site_url}/"
      postLogoutRedirectUri = "${local.site_url}/"
      scope       = var.oidc_scope
    }
  })
}

output "bucket_name" {
  value = aws_s3_bucket.site.id
}

output "bucket_arn" {
  value = aws_s3_bucket.site.arn
}

output "distribution_id" {
  value = var.enable_cloudfront ? aws_cloudfront_distribution.this[0].id : null
}

output "distribution_arn" {
  value = var.enable_cloudfront ? aws_cloudfront_distribution.this[0].arn : null
}

output "domain_name" {
  value = var.enable_cloudfront ? aws_cloudfront_distribution.this[0].domain_name : null
}

output "site_url" {
  value = local.site_url
}
