# Deploying Mini Banker to AWS: the story of the walls

A practice banker desktop (Vite React SPA, Lambda BFF, DynamoDB, Cognito) that I deployed to my own AWS account with Terraform. The plan looked simple. The account had other ideas. This is the order things went wrong in, and what each one taught me.

## The setup

- Goal: one `terraform apply` for the whole app, then CI deploys on every merge to `main`.
- Terraform layout: `bootstrap/` (state bucket, lock table, budget; local state) and `envs/dev/` (everything else; S3 backend).
- Cost guard: all pay-per-request services, plus a budget alert at USD 10.
- Learning goal: I was new to Terraform, so every step doubled as a lesson.

## Chapter 1: "Do I really need Grafana Cloud?"

The plan assumed a Grafana Cloud stack for dashboards. I thought Grafana was open source and was surprised to need an account.

- Grafana the software is open source. Grafana Cloud is the hosted service, and the Terraform provider talks to a hosted stack.
- Decision: "make the app work first." I added `enable_observability` (default false) and put `count` on the observability module.
- Lesson: adding `count` turns a module's outputs into a list, so `module.observability.x` became `module.observability[0].x`. `terraform validate` caught the missed spot right away. Optional features should be switchable early.

## Chapter 2: the network and the lock

- `terraform init` failed twice with "connection reset" from the registry. It was the network, not the config. A retry fixed it.
- `init -backend=false` was my first look at Terraform without touching AWS: it checks the code and downloads providers, but connects to no state.
- The interactive prompt trap: during bootstrap I answered a variable prompt wrongly and the plan showed my budget email being replaced by "5". I had typed a menu answer into a variable prompt. Lesson: read the plan before applying, and put values in `terraform.tfvars` or `-var`, not prompts.
- `prevent_destroy` on the state bucket blocked my destroy. That is the guard doing its job. I turned it off briefly and turned it back on.

## Chapter 3: the Singapore detour

I live in Vietnam, so I wanted `ap-southeast-1` for latency. I changed the region everywhere.

- Result: `AccessDenied` on `s3:CreateBucket` and `dynamodb:CreateTable`, with the reason "explicit deny in a service control policy."
- The account belongs to an AWS Organization, and an SCP forbids creating resources in that region. SCPs override even admin permissions, so no IAM change on my side can fix them.
- I went back to Sydney, destroyed and re-applied bootstrap there, and restored `prevent_destroy`.
- Lesson: when AWS says "explicit deny in a service control policy", that is a wall around the account, not a bug in the Terraform.

## Chapter 4: two more walls on the first real apply

The dev apply created about half the stack: API Gateway, three Lambdas, DynamoDB, a Cognito pool, the site bucket. Then:

1. **GitHub OIDC provider.** `iam:CreateOpenIDConnectProvider` was denied by another SCP, so the keyless-CI role was impossible.
2. **CloudFront.** `CreateDistribution` failed: "account must be verified." AWS wants a Support case before a new account can use it.

Both are account-level restrictions. Retrying would not help.

## Chapter 5: designing around the blockers

Instead of waiting, I changed the architecture.

- **CloudFront off by default** (`enable_cloudfront = false`).
  - The SPA runs locally (`localhost:5173`) and calls the API directly.
  - I added CORS to the HTTP API, because the browser no longer sees one origin.
  - Cognito only accepts HTTP callbacks for `localhost`, which is why a plain S3 website was not a real option.
- **Confusion cleared up: two different "OIDC"s.** Users log in through Cognito (OIDC code + PKCE), which was never blocked. The blocked one was GitHub Actions' OIDC federation to AWS. Removing it costs deploy convenience, not user login.
- **IAM user instead of OIDC for CI** (`github_auth_mode = "iam_user"`). It is less safe, because long-lived keys sit in GitHub secrets, so I create the key by hand and keep it out of Terraform state.

## Chapter 6: a 2 KB surprise

The IAM user apply failed with `Maximum policy size of 2048 bytes exceeded`.

- Inline policies on users are capped at 2048 bytes. The same policy was fine on a role, which allows 10240.
- Fix: a managed policy (6144 bytes) attached to the user.
- Lesson: the same document can hit different limits depending on what it is attached to.

## Chapter 7: the app lied twice

With the API deployed I ran the SPA locally and hit two bugs that looked like something else.

- **"System not available."** The frontend's `parseConfig` requires `oidc.postLogoutRedirectUri`, and the Terraform-generated `config.json` did not have it. Fix in `modules/static_site`, plus the local copy.
- **A "CORS error" that was a 404.** The browser console blamed CORS, but the real problem was the URL: routes live under `/api/*`, and with CloudFront off `apiBaseUrl` was the bare API endpoint. Lesson: a CORS message on a failed request often hides a plain 404 or 5xx, because error responses carry no CORS headers. Check the network tab status first.

## Chapter 8: CI found a real bug

The e2e job failed on the cancel tests. The cancel transaction passed an unused `:gsi2sk` value (DynamoDB rejects unused expression attributes with a ValidationException) and never updated the customer's mandate summary row. Fixed in `18612fa` with a separate summary update. Lesson: the e2e suite against DynamoDB Local caught what unit tests with mocks could not.

## Chapter 9: expired keys and a deploy user that can't help itself

- `sts get-caller-identity` failed with `InvalidClientTokenId`: the `mbd-admin` key had been deactivated. A new key fixed it.
- The deploy IAM user cannot edit its own policy, which is correct least privilege but means every widening needs an admin apply by hand. `terraform plan` also needs read permissions for every resource it refreshes, which I only discovered by running it.

## Chapter 10: CloudFront finally, and one more wall

AWS Support enabled CloudFront. I flipped `enable_cloudfront` to true through a PR (branch protection means no direct pushes now), applied locally as admin, synced the SPA to S3 and smoke-tested the CloudFront URL. It worked.

Then the first merge-triggered Deploy failed:

> `AccessDenied: ... not authorized to perform: cloudfront:GetOriginAccessControl`

- Cause: the plan's refresh reads the OAC and the deploy policy did not allow it.
- The trap: CI could not fix the policy that CI was blocked by, because the plan fails before any apply. Merging the fix would just fail the same way. The only way out was one local apply as `mbd-admin`.
- A transient state-lock error appeared on the first try. I checked the lock table for a stale lock (none) and simply re-ran. Not forcing the unlock was the right call.
- Lesson: when a pipeline's permissions are managed by the pipeline, plan for a manual break-glass step, and keep an admin credential available until things settle.

## Smaller moments

- My terminal had no AWS credentials. Terraform then tried every source down to the EC2 metadata endpoint, which gave a confusing `169.254.169.254` error. The real message was "no credentials."
- "If I already have resources, will apply create them again?" No. The state file records what exists, and Terraform changes only the difference. Failed resources were never recorded, so they are retried. Always read `Plan: X to add, Y to change, Z to destroy`.
- Cost anxiety while waiting for Support: everything here is pay-per-request, so idle cost is roughly zero. The budget only alerts, it does not stop spend.
- Line endings: Windows CRLF made many files look modified in git. I committed only real changes.
- A safety hook refused a blind `terraform apply -auto-approve`. I looked at the plan first, which is the right habit anyway.

## What I would say in an interview

1. I deployed a serverless banking demo with Terraform in a restricted AWS Organization account.
2. I hit three guardrails: a region SCP, an OIDC SCP, and CloudFront account verification. I identified each from the error message, did not try to bypass them, and redesigned around them.
3. I found and fixed a real cancel-transaction bug through e2e CI, and debugged a misleading CORS error to its real cause.
4. I kept the design reversible with feature flags (`enable_observability`, `enable_cloudfront`, `github_auth_mode`), so each blocked piece can be turned on when the account allows it.
5. I separated bootstrap from the environment, used remote state with locking, kept secrets out of state, and set a cost budget.
6. I learned Terraform's real behaviour: `count` changes output shapes, `prevent_destroy` protects state, state decides what gets created, and plan output is the thing to read.

## Where it ended

Everything works: the SPA runs on CloudFront, the API and Cognito are live, branch protection requires `verify` and `e2e`, and every merge to `main` deploys through GitHub Actions with an IAM user key (OIDC stays blocked by the SCP).

## Still open (optional)

- Deactivate the `mbd-admin` key.
- Confirm the AWS Budgets notification email.
- Turn on observability (Grafana Cloud) and set the OTLP token.
- If the SCP ever allows it, switch CI to OIDC (`github_auth_mode`).
