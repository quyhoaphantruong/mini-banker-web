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
- [x] Fill in `infra/envs/dev/terraform.tfvars.example`
- [ ] Add `lock_table_name = "bdsmini-tflock"` to `terraform.tfvars.example` (required variable, no default; Terraform will prompt without it)
- [ ] `terraform fmt -recursive infra` and `terraform validate` in `infra/bootstrap` and `infra/envs/dev` (needs Terraform installed)
- [~] Commit Phase 0: pushed directly to `main` as `ea4f9b3` (no PR); CI (`verify`, `e2e`) result pending
- [ ] Commit `.claude/` (deploy-progress hook) if it should be shared

Known follow-ups (not blocking the first local apply):

- [ ] Widen the deploy role policy in `infra/modules/github_oidc/main.tf` once CI applies hit AccessDenied (e.g. `lambda:AddPermission`, tagging, create actions)
- [ ] Log group path mismatch: API module uses `/aws/apigateway/<prefix>-api`, deploy role allows `/aws/http-api/<prefix>-*` (only matters with `enable_api_access_log = true`)
- [x] Decide whether Grafana Cloud is required, or make `observability` optional behind a flag. Decision: optional, off by default (`enable_observability = false` in `envs/dev`; lambda module OTLP inputs are nullable). `terraform validate` passes (needed an `output.tf` fix); `deploy.yml` still passes the Grafana variables, check it before Phase 3
- [ ] Update `infra/README.md` variable list (`lock_table_name`, `grafana_otlp_endpoint`) and env var name `SIMULATE_SEARCH_500_CRNS` vs `CLAUDE.md`

## Phase 1: Local tooling and AWS account

- [ ] Install tools: `winget install Hashicorp.Terraform Amazon.AWSCLI GitHub.cli`
- [ ] AWS root account: MFA on, no root access keys, stop using root
- [x] IAM user `mbd-admin` (console access, `AdministratorAccess`, MFA on). IAM Identity Center not available on this account, so plain IAM user
- [x] CLI credentials for profile `mbd-admin`, region `ap-southeast-2`: `aws login --profile mbd-admin` if the CLI supports it, otherwise an access key via `aws configure --profile mbd-admin` (stored only in `~/.aws/credentials`)
- [x] `aws sts get-caller-identity --profile mbd-admin` works
- [ ] After Phase 2 one-off steps: deactivate/delete the `mbd-admin` access key (CI uses OIDC)
- [ ] `gh auth login`
- [~] Grafana Cloud stack created (free tier); note stack URL and OTLP gateway URL. Skipped for now, observability is off

## Phase 2: Bootstrap and first apply (local, admin credentials)

```bash
export AWS_PROFILE=mbd-admin
npm ci && npm run build -w backend -w frontend
```

Bootstrap:

- [x] `cd infra/bootstrap && terraform init && terraform apply -var budget_alert_email=<you>`
- [ ] Confirm the AWS Budgets subscription email
- [x] Record outputs: `state_bucket_name` = `bdsmini-tfstate-070404529867`, `lock_table_name` = `bdsmini-tflock`

Dev environment:

- [x] `cd infra/envs/dev && cp terraform.tfvars.example terraform.tfvars` and fill it in (gitignored; Grafana values omitted, `enable_observability = false`)
- [~] `export TF_VAR_grafana_service_account_token=glsa_...` (skipped, observability off)
- [x] `terraform init -backend-config="bucket=<state_bucket_name>"`
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
- [~] (skipped while observability is off) Metrics/traces appear in Grafana Explore; check metric names match the dashboards

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
| 2026-11-12 | Phase 0 pushed to `main` (`ea4f9b3`, rebased onto PR #1 merge). Push triggers CI; if CI passes, `Deploy` will run and fail at AWS credentials until Phases 1-3 are done (expected) |
| 2026-11-13 | `mbd-admin` IAM user and CLI profile verified (`sts get-caller-identity` OK). Grafana skipped: added `enable_observability` flag (default false) to `envs/dev` and made lambda OTLP inputs optional. Not yet validated |
| 2026-11-13 | `terraform init` in `envs/dev` failed twice: connection to registry.terraform.io reset while downloading providers (network, not config). Retried by user, `init -backend=false` then worked. `validate` failed on `output.tf` (`module.observability` is now a list); fixed with `[0]` behind the flag, `validate` now passes. `terraform fmt` also reports pre-existing formatting drift in `backend.tf` and `main.tf` |
| 2026-11-13 | Phase 2 bootstrap: `terraform init` and `plan` OK (7 to add, 0 to change, 0 to destroy: state bucket `bdsmini-tfstate-<account id>` with versioning, encryption and public access block, lock table `bdsmini-tflock`, budget). Not applied yet |
| 2026-11-13 | Bootstrap applied (user ran it): state bucket `bdsmini-tfstate-070404529867`, lock table `bdsmini-tflock`. Wrote `infra/envs/dev/terraform.tfvars` (gitignored). Budget subscription email still to confirm |
| 2026-11-13 | Switched region to `ap-southeast-1` (Singapore): bootstrap and dev defaults, `backend.tf`, `deploy.yml`, docs. Bootstrap had already been applied in `ap-southeast-2` (empty bucket and lock table): destroy it there, then re-apply in `ap-southeast-1`. Also `aws configure set region ap-southeast-1 --profile mbd-admin` |
| 2026-11-13 | Bootstrap destroy blocked by `prevent_destroy` on the state bucket. Temporarily set it to `false` in `infra/bootstrap/main.tf` for the region move; **set back to `true` after the re-apply in ap-southeast-1** |
| 2026-11-13 | Singapore (`ap-southeast-1`) is blocked: an AWS Organizations SCP explicitly denies `s3:CreateBucket` and `dynamodb:CreateTable` there for `mbd-admin`. Reverted all region edits to `ap-southeast-2`. The Sydney bootstrap had been destroyed, so it must be re-applied in Sydney, then set `prevent_destroy` back to `true` |
| 2026-11-13 | Bootstrap re-applied in `ap-southeast-2` (same bucket and lock table names). `prevent_destroy` restored to `true`. Next: build, then `envs/dev` init with `-backend-config="bucket=bdsmini-tfstate-070404529867"` and plan |
| 2026-11-13 | `envs/dev` init against the S3 backend OK; `terraform plan` = 47 to add, 0 to change, 0 to destroy (API Gateway, Cognito, DynamoDB, GitHub OIDC role, 3 Lambdas, CloudFront and site bucket). Not applied yet |
| 2026-11-13 | First `envs/dev` apply partly done (API Gateway, Lambdas, DynamoDB, Cognito pool, site S3 bucket exist). Two blockers: (1) SCP `p-1eg8j44r` denies `iam:CreateOpenIDConnectProvider`, so the GitHub OIDC provider and deploy role cannot be created; (2) CloudFront `CreateDistribution` denied: account must be verified by AWS Support. Cognito app client and API routes not yet created (depend on CloudFront URL) |
