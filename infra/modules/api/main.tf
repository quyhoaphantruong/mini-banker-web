variable "name_prefix" {
  type = string
}

variable "jwt_issuer" {
  type = string
}

variable "jwt_audience" {
  type = list(string)
}

variable "functions" {
  type = map(object({
    function_name = string
    invoke_arn = string 
  }))
}

variable "routes" {
  type = map(string)
  description = "Route key such as 'GET /api/launch' to a key of var.functions"
}

variable "throttling_burst_limit" {
  type = number
  default = 20
}

variable "throttling_rate_limit" {
  type = number
  default = 10
}

variable "cors_allow_origins" {
  type        = list(string)
  default     = []
  description = "Browser origins allowed to call the API directly. Needed when the SPA is not served through CloudFront."
}

variable "enable_access_logs" {
  type = bool
  default = false
}

variable "access_log_retention_days" {
  type = number
  default = 7
}

resource "aws_apigatewayv2_api" "this" {
  name = "${var.name_prefix}-api"
  protocol_type = "HTTP"

  dynamic "cors_configuration" {
    for_each = length(var.cors_allow_origins) > 0 ? [1] : []

    content {
      allow_origins = var.cors_allow_origins
      allow_methods = ["GET", "POST", "OPTIONS"]
      allow_headers = ["authorization", "content-type", "idempotency-key"]
      max_age       = 3600
    }
  }
}

resource "aws_apigatewayv2_authorizer" "jwt" {
  api_id = aws_apigatewayv2_api.this.id
  name = "cognito"
  authorizer_type = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    issuer = var.jwt_issuer
    audience = var.jwt_audience
  }
}

resource "aws_apigatewayv2_integration" "this" {
  for_each = var.functions
  api_id = aws_apigatewayv2_api.this.id
  integration_type = "AWS_PROXY"
  integration_method = "POST"
  integration_uri = each.value.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "this" {
  for_each = var.routes
  api_id = aws_apigatewayv2_api.this.id
  route_key = each.key
  target = "integrations/${aws_apigatewayv2_integration.this[each.value].id}"
  authorization_type = "JWT"
  authorizer_id = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_lambda_permission" "invoke" {
  for_each = var.functions
  statement_id = "AllowApiGatewayInvoke"
  action = "lambda:InvokeFunction"
  function_name = each.value.function_name
  principal = "apigateway.amazonaws.com"
  source_arn = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}

resource "aws_cloudwatch_log_group" "access" {
  count = var.enable_access_logs ? 1 : 0
  name = "/aws/apigateway/${var.name_prefix}-api"
  retention_in_days = var.access_log_retention_days
}

resource "aws_apigatewayv2_stage" "default" {
  api_id = aws_apigatewayv2_api.this.id
  name = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = var.throttling_burst_limit
    throttling_rate_limit = var.throttling_rate_limit
  }

  dynamic "access_log_settings" {
    for_each = aws_cloudwatch_log_group.access

    content {
      destination_arn = access_log_settings.value.arn
      format = jsonencode({
        requestId = "$context.requestId"
        routeKey = "$context.routeKey"
        status = "$context.status"
        latencyMs = "$context.responseLatency"
        error = "$context.error.message"
      })
    }
  }
}

output "api_id" {
  value = aws_apigatewayv2_api.this.id
}

output "api_endpoint" {
  value = aws_apigatewayv2_api.this.api_endpoint
}

output "api_domain_name" {
  value = replace(aws_apigatewayv2_api.this.api_endpoint, "https://", "")
  description = "Host only, for use as a Cloudfront origin."
}