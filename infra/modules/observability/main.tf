terraform {
  required_providers {
    aws     = { source = "hashicorp/aws" }
    grafana = {
      source = "grafana/grafana"
    }
  }
}

variable "name_prefix" {
  type = string
}

variable "alert_email" {
  type = string
}

variable "prometheus_datasource_uid" {
  type        = string
  default     = "grafanacloud-prom"
  description = "UID of the Grafana Cloud Mimir datasource."
}

variable "otlp_token_parameter_name" {
  type = string
}

locals {
  latency_metric = "http_server_duration_milliseconds"
}

# Terraform creates the parameter. The real token is set out of band, see infra/README.md.
resource "aws_ssm_parameter" "otlp_token" {
  name  = var.otlp_token_parameter_name
  type  = "SecureString"
  value = "placeholder"

  lifecycle {
    ignore_changes = [value]
  }
}

resource "grafana_folder" "this" {
  title = "Mini Banker Desktop"
}

resource "grafana_dashboard" "red" {
  folder      = grafana_folder.this.uid
  overwrite   = true
  config_json = replace(file("${path.module}/dashboards/red.json"), "__DS_UID__", var.prometheus_datasource_uid)
}

resource "grafana_dashboard" "business" {
  folder      = grafana_folder.this.uid
  overwrite   = true
  config_json = replace(file("${path.module}/dashboards/business.json"), "__DS_UID__", var.prometheus_datasource_uid)
}

resource "grafana_contact_point" "email" {
  name = "${var.name_prefix}-email"

  email {
    addresses = [var.alert_email]
  }
}

resource "grafana_notification_policy" "this" {
  group_by      = ["alertname"]
  contact_point = grafana_contact_point.email.name

  group_wait      = "30s"
  group_interval  = "5m"
  repeat_interval = "4h"
}

resource "grafana_rule_group" "api" {
  name               = "${var.name_prefix}-api"
  folder_uid         = grafana_folder.this.uid
  interval_seconds   = 60
  disable_provenance = true

  rule {
    name           = "API 5xx rate above 2%"
    condition      = "C"
    for            = "5m"
    no_data_state  = "OK"
    exec_err_state = "Error"
    annotations    = { summary = "More than 2% of API requests failed with 5xx over 5 minutes." }
    labels         = { severity = "critical" }

    data {
      ref_id         = "A"
      datasource_uid = var.prometheus_datasource_uid

      relative_time_range {
        from = 600
        to   = 0
      }

      model = jsonencode({
        refId   = "A"
        expr    = "100 * sum(rate(${local.latency_metric}_count{http_status_code=~\"5..\"}[5m])) / sum(rate(${local.latency_metric}_count[5m]))"
        instant = true
      })
    }

    data {
      ref_id         = "B"
      datasource_uid = "__expr__"

      relative_time_range {
        from = 600
        to   = 0
      }

      model = jsonencode({
        refId      = "B"
        type       = "reduce"
        expression = "A"
        reducer    = "Last"
        datasource = { type = "__expr__", uid = "__expr__" }
      })
    }

    data {
      ref_id         = "C"
      datasource_uid = "__expr__"

      relative_time_range {
        from = 600
        to   = 0
      }

      model = jsonencode({
        refId      = "C"
        type       = "threshold"
        expression = "B"
        datasource = { type = "__expr__", uid = "__expr__" }
        conditions = [{ evaluator = { type = "gt", params = [2] } }]
      })
    }
  }

  rule {
    name           = "Customer search p95 above 1s"
    condition      = "C"
    for            = "5m"
    no_data_state  = "OK"
    exec_err_state = "Error"
    annotations    = { summary = "p95 latency of POST /api/customers/search is above 1 second." }
    labels         = { severity = "warning" }

    data {
      ref_id         = "A"
      datasource_uid = var.prometheus_datasource_uid

      relative_time_range {
        from = 600
        to   = 0
      }

      model = jsonencode({
        refId   = "A"
        expr    = "histogram_quantile(0.95, sum by (le) (rate(${local.latency_metric}_bucket{http_route=\"/api/customers/search\"}[5m])))"
        instant = true
      })
    }

    data {
      ref_id         = "B"
      datasource_uid = "__expr__"

      relative_time_range {
        from = 600
        to   = 0
      }

      model = jsonencode({
        refId      = "B"
        type       = "reduce"
        expression = "A"
        reducer    = "Last"
        datasource = { type = "__expr__", uid = "__expr__" }
      })
    }

    data {
      ref_id         = "C"
      datasource_uid = "__expr__"

      relative_time_range {
        from = 600
        to   = 0
      }

      model = jsonencode({
        refId      = "C"
        type       = "threshold"
        expression = "B"
        datasource = { type = "__expr__", uid = "__expr__" }
        conditions = [{ evaluator = { type = "gt", params = [1000] } }]
      })
    }
  }
}

output "otlp_token_parameter_name" {
  value = aws_ssm_parameter.otlp_token.name
}

output "otlp_token_parameter_arn" {
  value = aws_ssm_parameter.otlp_token.arn
}