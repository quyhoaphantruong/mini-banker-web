# Mini Banker Desktop

A scaled-down pet version of a banker desktop, built to practise AWS end to end. A banker signs in, finds a customer by CRN, and views the profile, accounts, and PayTo mandates. The banker can also read a mandate's history and transactions, and cancel a mandate. All data is fake.

The stack is a Vite React SPA on S3 and CloudFront, a Lambda BFF behind API Gateway, a single DynamoDB table, Cognito for login, and Terraform for the infrastructure. See the diagram in [docs/architecture.drawio](docs/architecture.drawio) (open it with diagrams.net).

## Repository layout

| Path | Purpose |
|---|---|
| `shared/` | The contract: table keys, item types, API types, state machine, fixture ids, test ids |
| `backend/` | Lambda handlers and the local dev server |
| `frontend/` | Vite React app |
| `seed/` | Typed fake data and the loader (`@mbd/seed`) |
| `e2e/` | Playwright tests |
| `infra/` | Terraform modules and environments |
| `.github/workflows/` | CI and deploy pipelines |

## Run it locally

You need Node 22 or later and Docker.

```sh
npm ci
docker compose up -d dynamodb-local          # in-memory DynamoDB on :8000
export DYNAMODB_ENDPOINT=http://localhost:8000 AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local AWS_REGION=ap-southeast-2
npm run seed -w seed                       # creates the table and loads fixtures; safe to repeat
DEV_AUTH=1 SIMULATE_SEARCH_500_CRN=100000500 PORT=3001 npm run dev -w backend
npm run dev -w frontend                    # http://localhost:5173
```

`.env.example` lists every variable. `DEV_AUTH=1` skips the JWT check, so never set it in a deployed environment.

Fixture CRNs: `100000001` (individual with seven mandates), `100000002` (business), `100000003` (no accounts), `100000404` (not found), `100000500` (simulated 500).

The seed script refuses to run without `DYNAMODB_ENDPOINT` unless you set `SEED_ALLOW_AWS=1`.

## Tests

```sh
npm run typecheck
npm run lint
npm test          # unit tests in every workspace; the seed test starts a throwaway dynamodb-local container
npm run build
npm test -w e2e   # Playwright; starts dynamodb-local, the backend, and the frontend itself
```

First e2e run needs browsers: `npx playwright install chromium` from `e2e/`. Set `TEST_DYNAMODB_ENDPOINT` to run the seed test against an endpoint you already have instead of Docker.

## Deploy to AWS

See [infra/README.md](infra/README.md). The GitHub Actions deploy workflow assumes an IAM role through OIDC (repository variable `AWS_DEPLOY_ROLE_ARN`) and waits for approval on the `dev` environment.