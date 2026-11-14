# Infrastructure

Terraform for Mini Banker Desktop. Region `ap-southeast-2`. Everything is tagged `project=mini-banker-desktop`.

## Layout

- `bootstrap/` creates the remote state bucket, the lock table and the cost budget. It uses local state.
- `envs/dev/` wires the modules in `modules/` into one environment and uses the S3 backend.

## Prerequisites

- Terraform 1.9 or later, AWS credentials for the target account. Monitoring is CloudWatch and X-Ray only, so no third-party account is needed.
- Build the backend first. `envs/dev` zips `backend/dist/launch.mjs`, `customers.mjs` and `mandates.mjs`, and plan fails if they are missing. Each bundle must export `handler`.
- Build the frontend (`frontend/dist`) before the deploy step below.

## Apply order

1. Bootstrap.

```sh
cd infra/bootstrap
terraform init
terraform apply -var budget_alert_email=you@example.com
```

Confirm the AWS Budgets subscription email. Note the `state_bucket_name` output.

2. Dev environment.

```sh
cd infra/envs/dev
cp terraform.tfvars.example terraform.tfvars
terraform init -backend-config="bucket=<state_bucket_name>"
terraform apply
```

3. Confirm the SNS subscription email ("AWS Notification - Subscription Confirmation") sent to `alert_email`, otherwise alarms fire silently. Open the dashboard with `terraform output -raw dashboard_url`.

4. Create a banker user and add it to the group.

```sh
aws cognito-idp admin-create-user --user-pool-id "$(terraform output -raw cognito_user_pool_id)" --username you@example.com
aws cognito-idp admin-add-to-group --user-pool-id "$(terraform output -raw cognito_user_pool_id)" --username you@example.com --group-name banker
```

5. Deploy the SPA.

```sh
aws s3 sync frontend/dist "s3://$(terraform output -raw site_bucket)" --exclude config.json
aws cloudfront create-invalidation --distribution-id "$(terraform output -raw distribution_id)" --paths '/*'
```

Do not use `--delete` without the `--exclude`. `config.json` is owned by Terraform.

## Variables for envs/dev

Required: `state_bucket_name`, `lock_table_name`, `github_repository`.

Optional: `alert_email` (alarm emails; without it alarms only show in the console), `enable_observability` (default true: dashboard, alarms, SNS topic), `enable_tracing` (default true: X-Ray active tracing), `name_prefix`, `custom_domain` with `acm_certificate_arn` (certificate in `us-east-1`, no hosted zone is created), `cognito_domain_prefix`, `enable_api_access_logs`, API throttling limits, `create_github_oidc_provider` (set false if the account already has the GitHub provider).

## Monitoring (CloudWatch only)

| Signal | Source | Where |
| --- | --- | --- |
| Logs | Lambda stdout (request failures, audit lines), optional API access logs | `/aws/lambda/<name_prefix>-*`, Logs Insights |
| Platform metrics | `AWS/ApiGateway`, `AWS/Lambda`, `AWS/DynamoDB`, published by AWS | dashboard `<name_prefix>` |
| App metrics | EMF log lines from `backend/src/telemetry`, namespace `MiniBankerDesktop`: `RequestDuration` (dims `Service`, `Route`, `StatusClass`), `MandatesCancelled`, `CustomerSearchNotFound` (dim `Service`) | dashboard `<name_prefix>` |
| Traces | Lambda active tracing (X-Ray). The trace id is in `request.failed` and audit log lines as `traceId` | X-Ray traces and service map |
| Alerts | API 5xx rate above 2%, Lambda errors (per function), Lambda throttles, DynamoDB throttles, search p95 above 1 s | SNS topic `<name_prefix>-alerts` to `alert_email` |

The deploy user's policy (`modules/github_oidc`) grants CloudWatch alarm/dashboard and SNS actions. It cannot change its own policy, so apply that change locally with admin credentials before CI applies the observability module.

## Assumptions to check against backend and seed

- Function bundles are named `launch`, `customers` and `mandates`. Edit `local.functions` in `envs/dev/main.tf` if the backend differs.
- The search latency alarm matches `Service = <name_prefix>-customers`, `Route = /api/customers/search`, `StatusClass = 2xx`. Keep it in step with `METRIC_NAMESPACE` and the dimensions in `backend/src/telemetry/index.ts`.
- `config.json` holds `apiBaseUrl`, `devAuth` and `oidc.{authority,clientId,redirectUri,scope}` only.

## Cost warnings

Idle cost is close to zero. Standing costs to know about are the CloudWatch log groups (7 day retention), DynamoDB point-in-time recovery storage and CloudFront requests. Monitoring stays inside the CloudWatch free tier (7 of 10 free alarms, 1 of 3 free dashboards, X-Ray 100k traces a month). Custom EMF metrics are about USD 0.30 each a month: one per route and status class seen, plus two counters per function. To stop all spend, run `terraform destroy` in `envs/dev`. The site bucket has `force_destroy` on. The state bucket has `prevent_destroy`, so remove that lifecycle block before destroying `bootstrap`, and empty all object versions first. The budget only alerts, it does not stop spend.