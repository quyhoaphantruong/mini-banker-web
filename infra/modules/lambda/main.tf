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

variable "enable_tracing" {
  type        = bool
  default     = true
  description = "X-Ray active tracing. Free tier covers 100k traces a month."
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
    for_each = var.enable_tracing ? [1] : []

    # These actions do not support resource-level permissions.
    content {
      sid       = "WriteTraces"
      actions   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"]
      resources = ["*"]
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
    mode = var.enable_tracing ? "Active" : "PassThrough"
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.this[each.key].name
  }

  # AWS_REGION is reserved. The Lambda runtime sets it.
  # SERVICE_NAME is the `Service` dimension of the EMF metrics (backend/src/telemetry).
  environment {
    variables = {
      TABLE_NAME   = var.table_name
      SERVICE_NAME = "${var.name_prefix}-${each.key}"
    }
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