# Deploy plan: AWS and GitHub

Progress tracker for the first deployment of Mini Banker Desktop to AWS (`ap-southeast-2`) with GitHub Actions CD. Tick boxes as you go. Detailed commands live in `infra/README.md`; this file is the checklist.

Legend: `[x]` done, `[ ]` to do, `[~]` in progress or partially done.

---

## Phase 0: Repo fixes (code)

- [x] Fix typo `aws_dyanmodb_table` in `infra/bootstrap/outputs.tf`
- [x] Fix typo `module.obserability` in `infra/envs/dev/output.tf`
- [x] Rename state bucket `bdsmini-tfsate-*` to `bdsmini-tfstate-*` in `infra/bootstrap/main.tf` (before bootstrap is applied)
- [x] Align lock table name: `infra/envs/dev/backend.tf` now uses `bdsmini-tflock` (bootstrap default)
- [x] Add `infra/modules/dynamodb` (mirrors `shared/src/table.ts`: PK/SK, GSI1, GSI2, TTL, PITR)
- [x] Wire all modules in `infra/envs/dev/main.tf` (dynamodb, observability, lambda, cognito, api, static_site, github_oidc, grafana provider)
- [x] Declare `grafana_otlp_endpoint` in `infra/envs/dev/variables.tf`
- [x] Fix `.github/workflows/deploy.yml` (build step, backend-config, `TF_VAR_*` from the `dev` environment, apply saved plan)
- [x] Deploy role trusts `repo:<repo>:environment:dev` (`infra/modules/github_oidc`)
- [~] Fill in `infra/envs/dev/terraform.tfvars.example` (file exists but is empty on disk)
- [ ] `terraform fmt -recursive infra` and `terraform validate` in `infra/bootstrap` and `infra/envs/dev` (needs Terraform installed)
- [ ] Commit Phase 0 on a branch, open a PR, CI (`verify`, `e2e`) green

Known follow-ups (not blocking the first local apply):

- [ ] Widen the deploy role policy in `infra/modules/github_oidc/main.tf` once CI applies hit AccessDenied (e.g. `lambda:AddPermission`, tagging, create actions)
- [ ] Log group path mismatch: API module uses `/aws/apigateway/<prefix>-api`, deploy role allows `/aws/http-api/<prefix>-*` (only matters with `enable_api_access_log = true`)
- [ ] Decide whether Grafana Cloud is required, or make `observability` optional behind a flag
- [ ] Update `infra/README.md` variable list (`lock_table_name`, `grafana_otlp_endpoint`) and env var name `SIMULATE_SEARCH_500_CRNS` vs `CLAUDE.md`

## Phase 1: Local tooling and AWS account

- [ ] Install tools: `winget install Hashicorp.Terraform Amazon.AWSCLI GitHub.cli`
- [ ] AWS root account: MFA on, stop using root
- [ ] IAM Identity Center admin user, then `aws configure sso` (profile `mbd-admin`, region `ap-southeast-2`)
- [ ] `aws sts get-caller-identity --profile mbd-admin` works
- [ ] `gh auth login`
- [ ] Grafana Cloud stack created (free tier); note stack URL and OTLP gateway URL
- [ ] Grafana service account token (role Admin) created

## Phase 2: Bootstrap and first apply (local, admin credentials)

```bash
export AWS_PROFILE=mbd-admin
npm ci && npm run build -w backend -w frontend
```

Bootstrap:

- [ ] `cd infra/bootstrap && terraform init && terraform apply -var budget_alert_email=<you>`
- [ ] Confirm the AWS Budgets subscription email
- [ ] Record outputs: `state_bucket_name` = `__________`, `lock_table_name` = `bdsmini-tflock`

Dev environment:

- [ ] `cd infra/envs/dev && cp terraform.tfvars.example terraform.tfvars` and fill it in
- [ ] `export TF_VAR_grafana_service_account_token=glsa_...`
- [ ] `terraform init -backend-config="bucket=<state_bucket_name>"`
- [ ] `terraform apply`
- [ ] Record outputs: `site_url` = `__________`, `github_deploy_role_arn` = `__________`

One-off setup:

- [ ] Put the real OTLP token: `aws ssm put-parameter --name "$(terraform output -raw otlp_token_parameter_name)" --type SecureString --overwrite --value '<token>'`
- [ ] Create banker user: `admin-create-user`, `admin-add-to-group --group-name banker`, `admin-set-user-password --permanent`
- [ ] Seed: `SEED_ALLOW_AWS=1 TABLE_NAME=$(terraform output -raw table_name) AWS_REGION=ap-southeast-2 npm run seed -w seed`
- [ ] First SPA upload: `aws s3 sync frontend/dist s3://<site_bucket> --exclude config.json`, then CloudFront invalidation

Smoke test:

- [ ] Open `site_url`, log in through Cognito
- [ ] Search CRN `100000001` (accounts and seven mandates show)
- [ ] Cancel a mandate succeeds
- [ ] CRN `100000004` shows not found
- [ ] Metrics/traces appear in Grafana Explore; check metric names match the dashboards

## Phase 3: GitHub setup

- [ ] Settings, Environments: create `dev`
- [ ] (Optional) Required reviewer on `dev` so each deploy waits for approval
- [ ] `dev` environment variables and secret:

| Kind | Name | Value | Set |
|---|---|---|---|
| Variable | `AWS_DEPLOY_ROLE_ARN` | `terraform output -raw github_deploy_role_arn` | [ ] |
| Variable | `TF_STATE_BUCKET` | bootstrap `state_bucket_name` | [ ] |
| Variable | `ALERT_EMAIL` | alert email | [ ] |
| Variable | `GRAFANA_URL` | `https://<stack>.grafana.net` | [ ] |
| Variable | `GRAFANA_OTLP_ENDPOINT` | OTLP gateway URL | [ ] |
| Secret | `GRAFANA_SERVICE_ACCOUNT_TOKEN` | `glsa_...` | [ ] |
| Variable (optional) | `TF_LOCK_TABLE` | only if not `bdsmini-tflock` | [ ] |

- [ ] Settings, Branches: protect `main` (require PR, require checks `verify` and `e2e`)

## Phase 4: Deploy through CI

- [ ] Merge the Phase 0 PR into `main`
- [ ] CI passes, then `Deploy` starts via `workflow_run`
- [ ] Deploy run: plan shows no unexpected changes (infra already exists from the local apply)
- [ ] If AccessDenied: widen the deploy role (Phase 0 follow-up), apply locally, re-run
- [ ] Site still works after the CI deploy (repeat the smoke test)
- [ ] Every merge to `main` now deploys

## Teardown and cost

- Idle cost is close to zero. Budget alerts at 50% and 100% of USD 10; alerts only, no hard stop.
- Stop all spend: `terraform destroy` in `infra/envs/dev`.
- Bootstrap state bucket has `prevent_destroy`; remove it and empty all object versions before destroying `infra/bootstrap`.

## Log

| Date | Note |
|---|---|
| 2026-11-12 | Phase 0 code fixes done: typos, dynamodb module, `envs/dev/main.tf` wiring, `deploy.yml`, OIDC trust by environment |
