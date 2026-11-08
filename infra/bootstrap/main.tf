data "aws_caller_identity" "current" {}

locals {
  state_bucket_name = coalesce(var.state_bucket_name, "bdsmini-tfsate-${data.aws_caller_identity.current.account_id}")
}

resource "aws_s3_bucket" "state" {
  bucket = local.state_bucket_name

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id
  block_public_acls = true
  block_public_policy = true
  ignore_public_acls = true
  restrict_public_buckets = true
}

data "aws_iam_policy_document" "state_tls_only" {
  statement {
    sid = "DenyInsecureTransport"
    effect = "Deny"
    actions = [ "s3:*" ]
    resources = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]

    principals {
      type = "*"
      identifiers = [ "*" ]
    }

    condition {
      test = "Bool"
      variable = "aws:SecureTransport"
      values = [ "false" ]
    }
  }
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = data.aws_iam_policy_document.state_tls_only.json
  depends_on = [ aws_s3_bucket_public_access_block.state ]
}

resource "aws_dynamodb_table" "lock" {
  name = var.lock_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  server_side_encryption {
    enabled = true
  }
}

resource "aws_budgets_budget" "monthly" {
  name = "mini-banker-web"
  budget_type = "COST"
  limit_amount = tostring(var.budget_limit_usd)
  limit_unit = "USD"
  time_unit = "MONTHLY"

  dynamic "notification" {
    for_each = [50, 100]

    content {
      comparison_operator = "GREATER_THAN"
      threshold = notification.value
      threshold_type = "PERCENTAGE"
      notification_type = "ACTUAL"
      subscriber_email_addresses = [var.budget_alert_email]
    }
  }
}

