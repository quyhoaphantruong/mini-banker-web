# Infrastructure

Terraform for Mini Banker Desktop. Region `ap-southeast-2`. Everything is tagged `project=mini-banker-desktop`.

## Layout

- `bootstrap/` creates the remote state bucket, the lock table and the cost budget. It uses local state.
- `envs/dev/` wires the modules in `modules/` into one environment and uses the S3 backend.

## Prerequisites

- Terraform 1.9 or later, AWS credentials for the target account, a Grafana Cloud stack.
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

2. Create a Grafana service account token (Administration, Users and access, Service accounts, role Admin, add a token). Export it.

```sh
export TF_VAR_grafana_service_account_token=glsa_xxx
```

3. Dev environment.

```sh
cd infra/envs/dev
cp terraform.tfvars.example terraform.tfvars
terraform init -backend-config="bucket=<state_bucket_name>"
terraform apply
```

4. Set the real OTLP token. Terraform creates the SSM parameter with the value `placeholder` and ignores later changes to the value.

In Grafana Cloud open the stack, then Connections, OpenTelemetry, Configure. Generate a token and copy the `Authorization` value from the shown headers (the part after `Basic `). Then run:

```sh
aws ssm put-parameter --name "$(terraform output -raw otlp_token_parameter_name)" \
  --type SecureString --overwrite --value '<token>'
```

Also copy the OTLP gateway URL from that page into `grafana_otlp_endpoint`. Lambdas read the parameter at cold start, so recycle them after changing it (apply a code change or update an env var).

5. Create a banker user and add it to the group.

```sh
aws cognito-idp admin-create-user --user-pool-id "$(terraform output -raw cognito_user_pool_id)" --username you@example.com
aws cognito-idp admin-add-to-group --user-pool-id "$(terraform output -raw cognito_user_pool_id)" --username you@example.com --group-name banker
```

6. Deploy the SPA.

```sh
aws s3 sync frontend/dist "s3://$(terraform output -raw site_bucket)" --exclude config.json
aws cloudfront create-invalidation --distribution-id "$(terraform output -raw distribution_id)" --paths '/*'
```

Do not use `--delete` without the `--exclude`. `config.json` is owned by Terraform.

## Variables for envs/dev

Required: `state_bucket_name`, `github_repository`, `alert_email`, `grafana_url`, `grafana_otlp_endpoint`, `grafana_service_account_token` (sensitive, use `TF_VAR_`).

Optional: `name_prefix`, `custom_domain` with `acm_certificate_arn` (certificate in `us-east-1`, no hosted zone is created), `cognito_domain_prefix`, `prometheus_datasource_uid`, `enable_api_access_logs`, API throttling limits, `create_github_oidc_provider` (set false if the account already has the GitHub provider).

## Assumptions to check against backend and seed

- Function bundles are named `launch`, `customers` and `mandates`. Edit `local.functions` in `envs/dev/main.tf` if the backend differs.
- The dashboards and alerts use `http_server_duration_milliseconds_*` with labels `http_route` and `http_status_code`, plus the counters `mandate_cancel_count_total` and `customer_search_notfound_count_total`. Check the real names in Grafana Explore and edit `modules/observability/dashboards/*.json` and the rules if they differ.
- `config.json` holds `apiBaseUrl`, `devAuth` and `oidc.{authority,clientId,redirectUri,scope}` only.

## Cost warnings

Idle cost is close to zero. Standing costs to know about are the CloudWatch log groups (7 day retention), DynamoDB point-in-time recovery storage and CloudFront requests. Grafana Cloud free tier limits apply. To stop all spend, run `terraform destroy` in `envs/dev`. The site bucket has `force_destroy` on. The state bucket has `prevent_destroy`, so remove that lifecycle block before destroying `bootstrap`, and empty all object versions first. The budget only alerts, it does not stop spend.