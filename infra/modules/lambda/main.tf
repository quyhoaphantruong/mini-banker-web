terraform {
  required_providers {
    aws     = { source = "hashicorp/aws" }
    archive = { source = "hashicorp/archive" }
  }
}

variable "name_prefix" {
  type = string
}

variable "dist_dir" {
  type        = string
  description = "Absolute path of backend/dist, holding one <name>.mjs bundle per function."
}

variable "table_name" {
  type = string
}

variable "table_arn" {
  type = string
}

variable "index_arns" {
  type        = map(string)
  description = "Index name to ARN."
}

variable "otlp_endpoint" {
  type    = string
  default = null
}

variable "otel_auth_parameter_name" {
  type    = string
  default = null
}

variable "otel_auth_parameter_arn" {
  type    = string
  default = null
}

variable "handler" {
  type    = string
  default = "index.handler"
}

variable "log_retention_days" {
  type    = number
  default = 7
}

variable "functions" {
  type = map(object({
    dist_file     = string
    table_actions = list(string)
    index_names   = list(string)
  }))
  description = "Key is the function short name. An empty table_actions list grants no table access."
}

data "archive_file" "zip" {
  for_each    = var.functions
  type        = "zip"
  output_path = "${path.root}/.build/${each.key}.zip"

  source {
    content  = file("${var.dist_dir}/${each.value.dist_file}")
    filename = "index.mjs"
  }
}

resource "aws_cloudwatch_log_group" "this" {
  for_each          = var.functions
  name              = "/aws/lambda/${var.name_prefix}-${each.key}"
  retention_in_days = var.log_retention_days
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "this" {
  for_each           = var.functions
  name               = "${var.name_prefix}-${each.key}"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

data "aws_iam_policy_document" "this" {
  for_each = var.functions

  statement {
    sid       = "WriteOwnLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.this[each.key].arn}:*"]
  }

  dynamic "statement" {
    for_each = var.otel_auth_parameter_arn != null ? [1] : []

    content {
      sid       = "ReadOtlpToken"
      actions   = ["ssm:GetParameter"]
      resources = [var.otel_auth_parameter_arn]
    }
  }

  dynamic "statement" {
    for_each = length(each.value.table_actions) > 0 ? [1] : []

    content {
      sid     = "TableAccess"
      actions = each.value.table_actions
      resources = concat(
        [var.table_arn],
        [for name in each.value.index_names : var.index_arns[name]]
      )
    }
  }
}

resource "aws_iam_role_policy" "this" {
  for_each = var.functions
  name     = "access"
  role     = aws_iam_role.this[each.key].id
  policy   = data.aws_iam_policy_document.this[each.key].json
}

resource "aws_lambda_function" "this" {
  for_each         = var.functions
  function_name    = "${var.name_prefix}-${each.key}"
  role             = aws_iam_role.this[each.key].arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = var.handler
  filename         = data.archive_file.zip[each.key].output_path
  source_code_hash = data.archive_file.zip[each.key].output_base64sha256
  timeout          = 10
  memory_size      = 256

  tracing_config {
    mode = "PassThrough"
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.this[each.key].name
  }

  # AWS_REGION is reserved. The Lambda runtime sets it.
  environment {
    variables = merge(
      {
        TABLE_NAME        = var.table_name
        OTEL_SERVICE_NAME = "${var.name_prefix}-${each.key}"
      },
      var.otlp_endpoint == null ? {} : {
        OTEL_EXPORTER_OTLP_ENDPOINT = var.otlp_endpoint
        OTEL_AUTH_PARAMETER_NAME    = var.otel_auth_parameter_name
      }
    )
  }

  depends_on = [aws_iam_role_policy.this]
}

output "functions" {
  value = {
    for key, fn in aws_lambda_function.this : key => {
      function_name = fn.function_name
      arn           = fn.arn
      invoke_arn    = fn.invoke_arn
    }
  }
}