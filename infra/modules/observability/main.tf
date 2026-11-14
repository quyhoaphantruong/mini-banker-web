# CloudWatch-only observability: one SNS topic for alerts, a handful of alarms and one dashboard.
# Sources:
#   - AWS/Lambda, AWS/ApiGateway, AWS/DynamoDB: published by AWS automatically.
#   - MiniBankerDesktop: custom metrics the backend writes as EMF log lines (backend/src/telemetry).
#   - X-Ray: traces from Lambda active tracing (modules/lambda).
# Free tier covers 10 alarms and 3 dashboards; this module creates 7 alarms and 1 dashboard.

terraform {
  required_providers {
    aws = { source = "hashicorp/aws" }
  }
}

variable "name_prefix" {
  type = string
}

variable "region" {
  type = string
}

variable "alert_email" {
  type        = string
  default     = ""
  description = "Subscribed to the alarm topic when set. AWS emails a confirmation link first."
}

variable "function_names" {
  type        = map(string)
  description = "Function short name to Lambda function name."
}

variable "api_id" {
  type = string
}

variable "api_stage" {
  type    = string
  default = "$default"
}

variable "table_name" {
  type = string
}

variable "search_p95_threshold_ms" {
  type    = number
  default = 1000
}

locals {
  namespace         = "MiniBankerDesktop" # METRIC_NAMESPACE in backend/src/telemetry/index.ts
  search_route      = "/api/customers/search"
  alarm_actions     = [aws_sns_topic.alerts.arn]
  api_dimensions    = { ApiId = var.api_id, Stage = var.api_stage }
  customers_service = var.function_names["customers"]
}

resource "aws_sns_topic" "alerts" {
  name = "${var.name_prefix}-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alert_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# --- Alarms -------------------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "api_5xx_rate" {
  alarm_name          = "${var.name_prefix}-api-5xx-rate"
  alarm_description   = "More than 2% of API requests returned 5xx over 5 minutes."
  comparison_operator = "GreaterThanThreshold"
  threshold           = 2
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  metric_query {
    id          = "rate"
    expression  = "IF(requests > 0, 100 * errors / requests, 0)"
    label       = "5xx %"
    return_data = true
  }

  metric_query {
    id = "errors"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5xx"
      dimensions  = local.api_dimensions
      period      = 300
      stat        = "Sum"
    }
  }

  metric_query {
    id = "requests"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "Count"
      dimensions  = local.api_dimensions
      period      = 300
      stat        = "Sum"
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each            = var.function_names
  alarm_name          = "${each.value}-errors"
  alarm_description   = "Lambda ${each.value} threw unhandled errors (handled 5xx are in the API alarm)."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = each.value }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "lambda_throttles" {
  alarm_name          = "${var.name_prefix}-lambda-throttles"
  alarm_description   = "Any project Lambda was throttled."
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions

  metric_query {
    id          = "total"
    expression  = join(" + ", [for k, _ in var.function_names : "t_${k}"])
    label       = "Throttles"
    return_data = true
  }

  dynamic "metric_query" {
    for_each = var.function_names
    content {
      id = "t_${metric_query.key}"
      metric {
        namespace   = "AWS/Lambda"
        metric_name = "Throttles"
        dimensions  = { FunctionName = metric_query.value }
        period      = 300
        stat        = "Sum"
      }
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "dynamodb_throttles" {
  alarm_name          = "${var.name_prefix}-dynamodb-throttles"
  alarm_description   = "DynamoDB table ${var.table_name} throttled reads or writes."
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions

  metric_query {
    id          = "total"
    expression  = "reads + writes"
    label       = "Throttle events"
    return_data = true
  }

  metric_query {
    id = "reads"
    metric {
      namespace   = "AWS/DynamoDB"
      metric_name = "ReadThrottleEvents"
      dimensions  = { TableName = var.table_name }
      period      = 300
      stat        = "Sum"
    }
  }

  metric_query {
    id = "writes"
    metric {
      namespace   = "AWS/DynamoDB"
      metric_name = "WriteThrottleEvents"
      dimensions  = { TableName = var.table_name }
      period      = 300
      stat        = "Sum"
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "search_p95" {
  alarm_name          = "${var.name_prefix}-search-p95"
  alarm_description   = "p95 of POST ${local.search_route} above ${var.search_p95_threshold_ms} ms for 5 minutes."
  namespace           = local.namespace
  metric_name         = "RequestDuration"
  dimensions          = { Service = local.customers_service, Route = local.search_route, StatusClass = "2xx" }
  extended_statistic  = "p95"
  period              = 300
  evaluation_periods  = 1
  threshold           = var.search_p95_threshold_ms
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# --- Dashboard ----------------------------------------------------------------------------------

locals {
  fn_metrics = { for metric, stat in { Invocations = "Sum", Errors = "Sum", Duration = "p95", ConcurrentExecutions = "Maximum" } :
    metric => [for _, name in var.function_names : ["AWS/Lambda", metric, "FunctionName", name, { stat = stat }]]
  }

  widget = { region = var.region, view = "timeSeries", period = 300 }

  widgets = [
    { type = "text", width = 24, height = 2, properties = { markdown = "## ${var.name_prefix}\nAPI Gateway, Lambda, DynamoDB and app metrics (`${local.namespace}` namespace). Traces: X-Ray, service map. Logs: `/aws/lambda/${var.name_prefix}-*`." } },

    { type = "metric", width = 8, height = 6, properties = merge(local.widget, { title = "API requests", stat = "Sum", metrics = [
      ["AWS/ApiGateway", "Count", "ApiId", var.api_id, "Stage", var.api_stage],
    ] }) },
    { type = "metric", width = 8, height = 6, properties = merge(local.widget, { title = "API 4xx / 5xx", stat = "Sum", metrics = [
      ["AWS/ApiGateway", "4xx", "ApiId", var.api_id, "Stage", var.api_stage],
      ["AWS/ApiGateway", "5xx", "ApiId", var.api_id, "Stage", var.api_stage],
    ] }) },
    { type = "metric", width = 8, height = 6, properties = merge(local.widget, { title = "API latency p50 / p95 (ms)", metrics = [
      ["AWS/ApiGateway", "Latency", "ApiId", var.api_id, "Stage", var.api_stage, { stat = "p50" }],
      ["AWS/ApiGateway", "Latency", "ApiId", var.api_id, "Stage", var.api_stage, { stat = "p95" }],
    ] }) },

    { type = "metric", width = 6, height = 6, properties = merge(local.widget, { title = "Lambda invocations", metrics = local.fn_metrics.Invocations }) },
    { type = "metric", width = 6, height = 6, properties = merge(local.widget, { title = "Lambda errors", metrics = local.fn_metrics.Errors }) },
    { type = "metric", width = 6, height = 6, properties = merge(local.widget, { title = "Lambda duration p95 (ms)", metrics = local.fn_metrics.Duration }) },
    { type = "metric", width = 6, height = 6, properties = merge(local.widget, { title = "Lambda concurrency", metrics = local.fn_metrics.ConcurrentExecutions }) },

    { type = "metric", width = 12, height = 6, properties = merge(local.widget, { title = "Request duration p95 by route (app, ms)", metrics = [
      [{ expression = "SEARCH('{${local.namespace},Service,Route,StatusClass} MetricName=\"RequestDuration\"', 'p95', 300)", id = "routes", label = "" }],
    ] }) },
    { type = "metric", width = 6, height = 6, properties = merge(local.widget, { title = "Mandates cancelled", stat = "Sum", metrics = [
      [{ expression = "SEARCH('{${local.namespace},Service} MetricName=\"MandatesCancelled\"', 'Sum', 300)", id = "cancel", label = "" }],
    ] }) },
    { type = "metric", width = 6, height = 6, properties = merge(local.widget, { title = "Customer search not found", stat = "Sum", metrics = [
      [{ expression = "SEARCH('{${local.namespace},Service} MetricName=\"CustomerSearchNotFound\"', 'Sum', 300)", id = "notfound", label = "" }],
    ] }) },

    { type = "metric", width = 12, height = 6, properties = merge(local.widget, { title = "DynamoDB consumed capacity", stat = "Sum", metrics = [
      ["AWS/DynamoDB", "ConsumedReadCapacityUnits", "TableName", var.table_name],
      ["AWS/DynamoDB", "ConsumedWriteCapacityUnits", "TableName", var.table_name],
    ] }) },
    { type = "metric", width = 12, height = 6, properties = merge(local.widget, { title = "DynamoDB throttles / system errors", stat = "Sum", metrics = [
      ["AWS/DynamoDB", "ReadThrottleEvents", "TableName", var.table_name],
      ["AWS/DynamoDB", "WriteThrottleEvents", "TableName", var.table_name],
      [{ expression = "SEARCH('{AWS/DynamoDB,TableName,Operation} MetricName=\"SystemErrors\" TableName=\"${var.table_name}\"', 'Sum', 300)", id = "syserr", label = "" }],
    ] }) },

    { type = "alarm", width = 24, height = 4, properties = { title = "Alarms", alarms = concat(
      [aws_cloudwatch_metric_alarm.api_5xx_rate.arn, aws_cloudwatch_metric_alarm.search_p95.arn, aws_cloudwatch_metric_alarm.lambda_throttles.arn, aws_cloudwatch_metric_alarm.dynamodb_throttles.arn],
      [for a in aws_cloudwatch_metric_alarm.lambda_errors : a.arn],
    ) } },
  ]
}

resource "aws_cloudwatch_dashboard" "this" {
  dashboard_name = var.name_prefix
  dashboard_body = jsonencode({ widgets = local.widgets })
}

output "alert_topic_arn" {
  value = aws_sns_topic.alerts.arn
}

output "dashboard_url" {
  value = "https://${var.region}.console.aws.amazon.com/cloudwatch/home?region=${var.region}#dashboards/dashboard/${aws_cloudwatch_dashboard.this.dashboard_name}"
}
