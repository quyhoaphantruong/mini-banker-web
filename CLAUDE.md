# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Mini Banker Desktop: a practice banker desktop (find customer by CRN, view accounts and PayTo mandates, cancel a mandate) built end to end. Vite React SPA, Lambda BFF behind API Gateway, one DynamoDB table (`bdsmini`), Cognito, Terraform. All data is fake. `docs/how-to-run.md`, `backend/README.md`, `frontend/README.md`, `infra/README.md`.

## Commands

npm workspaces (`shared`, `backend`, `frontend`, `seed`, `e2e`), Node >= 22, ESM throughout. Run from the repo root.

```sh
npm ci
npm run typecheck | lint | test | build   # all workspaces (--if-present)
npm test -w backend                       # one workspace
npx vitest run -w backend test/cancel.test.ts             # one file (or: cd backend && npx vitest run test/cancel.test.ts)
npx vitest run -t "name substring"                        # one test, from inside the workspace dir
npm test -w e2e                           # Playwright; boots dynamodb-local, backend, frontend itself
```

Local dev (details in `README.md`):

```sh
docker compose up -d dynamodb-local
export DYNAMODB_ENDPOINT=http://localhost:8000 AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local AWS_REGION=ap-southeast-2
npm run seed -w seed                      # idempotent; refuses to run without DYNAMODB_ENDPOINT unless SEED_ALLOW_AWS=1
DEV_AUTH=1 PORT=3001 npm run dev -w backend
npm run dev -w frontend                   # :5173, proxies /api to :3001
```

- Backend and seed tests start DynamoDB Local (docker, else a jar in `~/.cache/mbd-dynamodb-local`); the DynamoDB suites are skipped, printed reason, if neither is available. `TEST_DYNAMODB_ENDPOINT` points them at an existing endpoint.
- `DEV_AUTH=1` skips JWT verification (claims from `x-dev-user` / `x-dev-groups`). Never set it in a deployed environment; the local server refuses to start with it unless `DYNAMODB_ENDPOINT` is set.
- Only `frontend` has a real `lint` script (eslint).

## Architecture

**`shared/` is the contract.** Every other workspace imports `@mbd/shared`. It is consumed as TypeScript source (`exports: ./src/index.ts`, build, no dist). Import only from the package root; new code must be re-exported from `shared/src/index.ts`. It holds the table key building (`keys.ts`: `TABLE`, `customerPk`, `SK`, GSI helpers), item and API types, the mandate state machine (`nextStatus`), reason codes, fixture and test ids. Changing a key shape or API type there ripples into backend, seed, frontend and e2e, so typecheck the whole repo.

**Single-table DynamoDB.** Keys (`PK`/`SK`, `GSI1` account lookup, `GSI2` mandates by customer and status, `ttl` for idempotency) defined only in `shared/src/keys.ts`; never hand-build key strings elsewhere. `shared/src/table.ts` exports `createTableInput` tests to create the table.

**Backend (`backend/src`)** layers, outermost to innermost:
- `lambda/{launch,customers,mandates}.ts`: three bundle entry points, each exporting `handler`.
- `http/`: API Gateway HTTP API v2 adapter: auth, router (`event.routeKey`, falling back to method + `rawPath`), zod parsing, per-request telemetry.
- `handlers/`: route tables.
- `domain/`: pure logic (cancel planning using shared `nextStatus`, cancel use case, audit) behind `ports.ts`.
- `repo/`: lib-dynamodb implementation of the ports (access patterns A1-A9). Cancel is a single `TransactWriteItems`.
- `deps.ts` wires dependencies; `local/server.ts` is the dev server over the same handlers.
- Build (`backend/scripts/build.mjs`) is esbuild with `bundle: true`, so shared is inlined into each `dist/*.mjs`.
- Telemetry is CloudWatch only: metrics are EMF log lines (`telemetry/index.ts`, namespace `MiniBankerDesktop`), traces are Lambda X-Ray active tracing. No-op outside Lambda unless `EMF_ENABLED=1`. Alarms and the dashboard live in `infra/modules/observability`.

**Frontend** fetches `/config.json` at startup (`devAuth` bypasses Cognito; otherwise OIDC code+PKCE with `oidc-client-ts`), to Typed API client in `src/api` built on the shared `ROUTES`; `apiBaseUrl` replaces the `/api` prefix. Navigation is React state, formatted only in `src/format.ts`. Tests use MSW.

**Seed** (`@mbd/seed`) holds typed fixtures and the loader; e2e reuses it. Fixture CRNs: `100000001` (individual, seven mandates), `100000002` (business), `100000003` (no accounts), `100000004` (not found), `100000005` (simulated 500 via `SIMULATE_SEARCH_500_CRN`).

**Infra** is Terraform under `infra/{bootstrap,modules,envs}`; `.github/workflows/{ci,deploy}.yml` deploy through OIDC with app environment.

## TypeScript config

`tsconfig.base.json` is strict, with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, and `moduleResolution: Bundler`. Imports in source use `.js` extensions (see `shared/src/index.ts`).