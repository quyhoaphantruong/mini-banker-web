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
- [x] Add `lock_table_name = "bdsmini-tflock"` to `terraform.tfvars.example` (required variable, no default; Terraform will prompt without it)
- [x] `terraform fmt -recursive infra` (done, user confirmed) and `terraform validate` in `infra/bootstrap` and `infra/envs/dev` (needs Terraform installed)
- [x] Commit Phase 0: pushed directly to `main` as `ea4f9b3` (no PR); CI now green
- [ ] Commit `.claude/` (deploy-progress hook) if it should be shared

Known follow-ups (not blocking the first local apply):

- [ ] Widen the deploy role policy in `infra/modules/github_oidc/main.tf` once CI applies hit AccessDenied (e.g. `lambda:AddPermission`, tagging, create actions)
- [ ] Log group path mismatch: API module uses `/aws/apigateway/<prefix>-api`, deploy role allows `/aws/http-api/<prefix>-*` (only matters with `enable_api_access_log = true`)
- [x] Decide whether Grafana Cloud is required, or make `observability` optional behind a flag. Decision: optional, off by default (`enable_observability = false` in `envs/dev`; lambda module OTLP inputs are nullable). `terraform validate` passes (needed an `output.tf` fix); `deploy.yml` still passes the Grafana variables, check it before Phase 3
- [ ] Update `infra/README.md` variable list (`lock_table_name`, `grafana_otlp_endpoint`) and env var name `SIMULATE_SEARCH_500_CRNS` vs `CLAUDE.md`

## Phase 1: Local tooling and AWS account

- [x] Install tools: `winget install Hashicorp.Terraform Amazon.AWSCLI GitHub.cli`
- [x] AWS root account: MFA on, no root access keys, stop using root
- [x] IAM user `mbd-admin` (console access, `AdministratorAccess`, MFA on). IAM Identity Center not available on this account, so plain IAM user
- [x] CLI credentials for profile `mbd-admin`, region `ap-southeast-2`: `aws login --profile mbd-admin` if the CLI supports it, otherwise an access key via `aws configure --profile mbd-admin` (stored only in `~/.aws/credentials`)
- [x] `aws sts get-caller-identity --profile mbd-admin` works
- [ ] After Phase 2 one-off steps: deactivate/delete the `mbd-admin` access key (CI uses OIDC)
- [x] `gh auth login`
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
- [x] `terraform apply`
- [x] Re-apply with CloudFront off (`enable_cloudfront = false`, `github_auth_mode = "iam_user"`, both defaults); record outputs: `api_endpoint` = `https://o7ofj0h1wl.execute-api.ap-southeast-2.amazonaws.com`, `github_deploy_user_name` = `bdsmini-dev-github-deploy`, table `bdsmini-dev`, Cognito pool `ap-southeast-2_Q77pu9Mu4`, client `6fhii1hikkuv95pg32jbg8d32h`

One-off setup:

- [~] ~~Put the real OTLP token in SSM~~ (obsolete 2026-11-14: Grafana dropped, monitoring is CloudWatch only)
- [x] Create banker user: `admin-create-user`, `admin-add-to-group --group-name banker`, `admin-set-user-password --permanent` (done 2026-11-13: user `quyhoaphantruong@gmail.com`, in `banker`, CONFIRMED)
- [x] Seed: `SEED_ALLOW_AWS=1 TABLE_NAME=$(terraform output -raw table_name) AWS_REGION=ap-southeast-2 npm run seed -w seed`
- [~] First SPA upload (skipped while CloudFront is off; the SPA runs locally with `npm run dev -w frontend` against the deployed API and Cognito)

Smoke test:

- [x] Run the SPA locally (`site_url` is `http://localhost:5173`, `config.json` in the bucket holds the API URL), log in through Cognito
- [x] Search CRN `100000001` (accounts and seven mandates show)
- [x] Cancel a mandate succeeds
- [x] CRN `100000004` shows not found
- [ ] (Phase 6) Metrics appear in the CloudWatch dashboard and traces in X-Ray

## Phase 3: GitHub setup

Auth is the IAM user `bdsmini-dev-github-deploy` (access keys as GitHub secrets), not OIDC.

- [x] Rework `deploy.yml` for IAM user keys: no `id-token`, no role; Grafana TF_VARs fall back to the Terraform defaults; CloudFront invalidation skipped when `distribution_id` is null
- [x] Widen the deploy policy for `terraform plan` refresh (`ReadDeployIdentity`, `ReadUnscoped`, `lambda:Get*/List*`, object tagging); `validate` passes
- [x] Apply the widened policy locally as `mbd-admin` (done 2026-11-13, also pushed the fixed `config.json` to the site bucket) (`terraform apply` in `infra/envs/dev`); the deploy user cannot change its own policy
- [x] Create the access key: `aws iam create-access-key --user-name bdsmini-dev-github-deploy --profile mbd-admin` (do not commit or paste it anywhere else)
- [x] Settings, Environments: create `dev`
- [ ] (Optional) Required reviewer on `dev` so each deploy waits for approval
- [ ] `dev` environment variables and secrets:

| Kind | Name | Value | Set |
|---|---|---|---|
| Secret | `AWS_ACCESS_KEY_ID` | deploy user access key id | [x] |
| Secret | `AWS_SECRET_ACCESS_KEY` | deploy user secret key | [x] |
| Variable | `TF_STATE_BUCKET` | `bdsmini-tfstate-070404529867` | [x] |
| Variable (optional) | `ALERT_EMAIL` | CloudWatch alarm email (SNS subscription) | [ ] |
| Variable (optional) | `TF_LOCK_TABLE` | only if not `bdsmini-tflock` | [ ] |
| Variable (optional) | `ENABLE_OBSERVABILITY` | `false` to skip dashboard and alarms (default `true`) | n/a |

- [x] Settings, Branches: protect `main` (require PR, require checks `verify` and `e2e`). Note: blocks direct pushes to `main`; branch protection on a private repo needs a paid plan

## Phase 4: Deploy through CI

- [x] Merge the Phase 0 PR into `main` (moot: pushed directly, see Phase 0)
- [x] CI passes, then `Deploy` starts via `workflow_run` (CI run 43403950694, Deploy run 43404228754, both success)
- [x] Deploy run: plan shows no unexpected changes (run succeeded; plan contents not reviewed) (infra already exists from the local apply)
- [ ] If AccessDenied: widen the deploy role (Phase 0 follow-up), apply locally, re-run
- [x] Site still works after the CI deploy (smoke test passed, user confirmed)
- [x] Every merge to `main` now deploys (PR #2 merge went through a PR with required checks)

## Phase 5: CloudFront

AWS Support enabled CloudFront on the account (`aws cloudfront list-distributions` returns an empty list, no error). `enable_cloudfront` now defaults to `true` so CI applies do not tear the distribution down.

- [x] Merge the PR that flips the default (branch protection requires a PR)
- [x] Local apply as `mbd-admin` in `infra/envs/dev` (the deploy user cannot create these): `terraform plan` then `terraform apply` (distribution takes 5-15 min; Cognito callback/logout URLs, `config.json` and API CORS change)
- [x] Upload the SPA: `aws s3 sync frontend/dist s3://bdsmini-dev-site-070404529867 --delete --exclude config.json --profile mbd-admin` (or let Deploy do it)
- [x] Open the `site_url` output (`https://...cloudfront.net`), log in, repeat the smoke test (`100000001`, cancel a mandate, `100000004`)
- [x] Check the post-merge Deploy run; widen the deploy policy if CI hits AccessDenied on CloudFront reads or `cloudfront:CreateInvalidation`; apply locally

## Phase 6: CloudWatch monitoring

Grafana Cloud and OTel removed. Metrics are EMF log lines (namespace `MiniBankerDesktop`), traces are X-Ray active tracing, and `modules/observability` holds the SNS topic, 7 alarms and one dashboard. `enable_observability` now defaults to `true`.

- [x] Code: backend telemetry to EMF, OTel and SSM deps removed, Lambda X-Ray `Active`, observability module rewritten, deploy policy gains CloudWatch alarm/dashboard and SNS actions (SSM removed); `terraform validate` passes
- [ ] `terraform init -upgrade` in `envs/dev` (drops the grafana provider from `.terraform.lock.hcl`; failed 2026-11-14 with "session has expired", re-auth and retry), commit the lock file
- [ ] Local `terraform.tfvars`: set `enable_observability = true` (it is `false` there and overrides the default) and `alert_email`
- [ ] `npm run build -w backend`, then local `terraform apply` as `mbd-admin` (deploy policy must change before CI can create alarms/SNS)
- [ ] Confirm the SNS subscription email
- [ ] Set `ALERT_EMAIL` in the GitHub `dev` environment
- [ ] Smoke test, then check the dashboard (`terraform output -raw dashboard_url`), `MiniBankerDesktop` metrics and an X-Ray trace

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
| 2026-11-13 | Architecture change: CloudFront and the GitHub OIDC provider are blocked, so both are now optional. `enable_cloudfront` (default false) in `static_site`: SPA runs locally, API called directly, API CORS allows `local_dev_origin`. `github_auth_mode` (default `iam_user`) in `github_oidc`: IAM user instead of OIDC role; create its access key by hand (not in state) and store as GitHub secrets. `validate` passes. Not applied yet. `deploy.yml` still assumes an OIDC role: needs rework for access-key secrets |
| 2026-11-13 | Apply of the IAM user hit `LimitExceeded: Maximum policy size of 2048 bytes` (inline user policy cap). Switched the deploy policy to a managed `aws_iam_policy` attached to the user (6144 byte cap). `validate` passes; re-apply needed |
| 2026-11-13 | `envs/dev` apply completed with CloudFront off and IAM user auth (API, Cognito client, Lambdas, DynamoDB `bdsmini-dev`, site bucket, deploy user). Next: banker user, seed (TABLE_NAME=bdsmini-dev), run SPA locally, smoke test |
| 2026-11-13 | Local SPA showed "System not available": `parseConfig` requires `oidc.postLogoutRedirectUri`, which the Terraform-generated `config.json` lacked. Added it in `modules/static_site` (re-apply to update the S3 copy) and in the local `frontend/public/config.json` |
| 2026-11-13 | Banker user created in the Cognito pool (`admin-create-user`, added to `banker`, permanent password set; status CONFIRMED). Next: seed (TABLE_NAME=bdsmini-dev), run SPA locally, smoke test |
| 2026-11-13 | Browser CORS error on `/launch` was really a 404: routes live under `/api/*` but `apiBaseUrl` (CloudFront off) was the bare API endpoint. Fixed `api_base` in `modules/static_site` to `<endpoint>/api` and in local `frontend/public/config.json`. Re-apply to update the S3 copy |
| 2026-11-13 | Seed and local smoke test confirmed done by user: Cognito login, CRN `100000001` search, mandate cancel, CRN `100000004` not found |
| 2026-11-13 | Phase 3 started. Decision: IAM user keys only (OIDC blocked by SCP). `deploy.yml` reworked (access-key secrets, Grafana defaults, CloudFront-optional publish). Deploy policy widened with refresh reads; `validate` passes, local apply pending. `gh` not authenticated in Claude's shell, so GitHub settings are done by the user |
| 2026-11-13 | Local `terraform plan` for the policy change failed: STS `InvalidClientTokenId` for profile `mbd-admin` (`aws sts get-caller-identity` fails too). The access key in `~/.aws/credentials` is deactivated or deleted; needs a new key before the apply |
| 2026-11-13 | User replaced the `mbd-admin` key. `envs/dev` apply: 0 added, 2 changed, 0 destroyed (deploy policy widened; S3 `config.json` now has `/api` base and `postLogoutRedirectUri`). Next: create deploy user access key, GitHub `dev` environment, secrets and `TF_STATE_BUCKET` |
| 2026-11-13 | CI failed on e2e cancel tests: cancel transaction passed unused `:gsi2sk` (DynamoDB ValidationException) and never updated the customer summary row. Fixed in `18612fa` (separate summary Update). CI and Deploy (run 43404228754) both green. Next: confirm deploy user key/secrets state, site smoke test, branch protection |
| 2026-11-13 | User confirmed CI passed on `18612fa`. Phase 4 "CI passes, Deploy starts" stays ticked. Phase 3 secrets and `dev` environment boxes left as-is until the user confirms them (a green Deploy implies the keys exist, but that is not verified here) |
| 2026-11-13 | User confirmed: `dev` environment, deploy user key, secrets and `TF_STATE_BUCKET` set via gh CLI; smoke test after CI deploy passed. Remaining: review deploy plan output, branch protection, deactivate `mbd-admin` key (optional), budget email, `terraform fmt` |
| 2026-11-13 | Deploy apply via CI succeeded: 0 added, 3 changed, 0 destroyed (outputs unchanged; the three Lambdas). Skipped for now: deactivating the `mbd-admin` key |
| 2026-11-13 | User protected `main` and ran `terraform fmt`. AWS User Notifications verification email received; user to click Verify email (expires in 12h) and tick the Budgets subscription item once confirmed |
| 2026-11-13 | AWS Support enabled CloudFront. Branch `cloudfront-default-on` flips `enable_cloudfront` default to true and adds Phase 5. Local apply and SPA upload pending |
| 2026-11-13 | CloudFront live: local apply 5 added, 7 changed, 0 destroyed; `site_url` `https://d21tuarzeokcq6.cloudfront.net`, `distribution_id` `E1YZFWYC02AYQ3`. SPA synced to the site bucket (only `index.html` differed). Smoke test on the CloudFront URL passed. PR #2 merged: `enable_cloudfront` defaults to true |
| 2026-11-13 | Post-merge Deploy failed at plan refresh: deploy user lacked `cloudfront:GetOriginAccessControl` (AccessDenied). Branch `cloudfront-deploy-perms` adds OAC read/update, distribution tag and config actions to the deploy policy; needs a local apply as `mbd-admin`, then re-run Deploy |
| 2026-11-13 | Chicken-and-egg: Deploy plan refresh needed `cloudfront:GetOriginAccessControl`, which the deploy user lacked, and the deploy user cannot change its own policy. PR #3 added OAC and distribution tag actions; user applied locally as `mbd-admin` (0 added, 1 changed, 0 destroyed) after one transient state-lock error (no stale lock found). Re-run Deploy is green. **Deployment complete**: SPA on CloudFront, CI deploys every merge. Story of the problems: `docs/deploy-story.md` |
| 2026-11-14 | Architecture change: monitoring is CloudWatch only (Grafana judged redundant). Backend emits EMF metrics, Lambdas use X-Ray active tracing, `modules/observability` is now SNS + 7 alarms + dashboard, Grafana provider/vars/SSM token and OTel deps removed, diagrams relabelled. Backend typecheck and build OK, `terraform validate` OK; `init -upgrade` failed ("session has expired"). Not applied yet, see Phase 6 |
| 2026-11-14 | Found `envs/dev` had been destroyed on 2026-11-13 (`infra/teardown.sh`; state held only the deploy IAM user, no Lambdas/table/CloudFront). `terraform init -upgrade` OK. User approved a rebuild: apply 56 added, 0 changed, 0 destroyed, incl. CloudWatch dashboard, 7 alarms, SNS topic. New values: `api_endpoint` `https://zzap417hif.execute-api.ap-southeast-2.amazonaws.com`, `site_url` `https://d3u08akq013p53.cloudfront.net`, `distribution_id` `E1COBNYF9XZO70`, Cognito pool `ap-southeast-2_5T3Hvc0zq`, client `3ihc5g6hjuiit28i4cj1hm1sc5`. GitHub `dev` variable `ALERT_EMAIL` set. Still to do: confirm SNS email, banker user, seed, SPA upload, new deploy-user access key and secrets, local `config.json`, smoke test |
| 2026-11-14 | After the rebuild: seeded 43 items into `bdsmini-dev`, synced `frontend/dist` to the site bucket (config.json excluded) and invalidated CloudFront (`I9N38ZQ9A17JOHGJRT6ZR2BS23`), updated local `frontend/public/config.json` to the new API and Cognito IDs. Still to do: banker user, deploy-user access key and GitHub secrets, confirm SNS email, smoke test |
| 2026-11-14 | Deploy IAM user `bdsmini-dev-github-deploy` had been deleted by hand (state drift). Re-applied: 2 added, 0 changed, 0 destroyed (user and policy attachment). New access key and GitHub secrets still to set via the rotate script |
| 2026-11-14 | PR #5 merged. First CI Deploy failed: deploy user tried to UntagUser a tag named after its access key id (added by the IAM console "description tag" when the key was created). Removed the tag with `aws iam untag-user` as admin, `terraform plan` clean, Deploy re-run succeeded. Tip: create deploy keys with the CLI, not the console, or the tag returns |
