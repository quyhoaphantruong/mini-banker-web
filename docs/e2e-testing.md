# End-to-end tests

This document describes how the end-to-end (e2e) suite works today. The suite lives in `e2e/` and uses Playwright. It drives the real frontend and backend against a local DynamoDB. It never touches AWS.

## What runs

A test run uses three processes plus the browser:

| Process | Port | Started by |
|---|---|---|
| `dynamodb-local` (in memory, via `docker compose`) | 8000 | Playwright `webServer` |
| Backend dev server (`npm run dev -w backend`) | 3001 | Playwright `webServer` |
| Frontend Vite dev server | 5173 | Playwright `webServer` |

The backend starts with `DEV_AUTH=1`, so it skips JWT verification. The frontend's `public/config.json` has `devAuth: true`, so the login screen is skipped and the app sends `x-dev-user` and `x-dev-groups` headers. The suite therefore does not test Cognito or OIDC.

Playwright starts all three through `webServer` in `e2e/playwright.config.ts`. Outside CI, it reuses a server that is already running on the port. In CI (`CI` set) it always starts fresh servers. Each server has a 120 s start-up timeout.

The backend gets `SIMULATE_SEARCH_500_CRN=100000500`, so searching that CRN returns a 500.

## Run it

From the repository root:

```sh
npm test -w e2e
```

The first run needs a browser. Run `npx playwright install chromium` from `e2e/`.

Docker must be available for `dynamodb-local`. You can start it yourself with `docker compose up -d dynamodb-local`.

## Layout

```
e2e/
  playwright.config.ts   servers, single worker, chromium only
  support/
    env.ts               ports, endpoint, table name, simulated-500 CRN
    db.ts                reseed(); ensure the table exists, then reset and load fixtures
    globalSetup.ts       retries reseed() until dynamodb-local answers
    pages.ts             helpers: openApp, searchCrn, openPayTo
  tests/
    customer.spec.ts     auth gate, search, not-found, simulated 500
    mandates.spec.ts     status tabs, badges, cancel, idempotent retry
```

## Data and isolation

All tests share one DynamoDB table (`bdsmini`). Because they write to it (the cancel tests change mandates), the suite runs with `workers: 1` and `fullyParallel: false`.

State is restored in two places:

- `globalSetup` calls `reseed()` once before the run. It retries for up to 60 seconds, because `dynamodb-local` may still be booting.
- Every spec file calls `test.beforeEach(reseed)`, so each test starts from the fixture state.

`reseed()` (`support/db.ts`) calls `ensureTable` and `resetAndSeed` from `@mbd/seed`. This is the same typed fixture data that `npm run seed -w seed` loads. Tests read expected values from `fixtures` and `MANDATE_IDS` in `@mbd/seed`, and from `FIXTURE_CUSTOMERS`, `CRN_NOT_FOUND` and `CRN_SIMULATED_500` in `@mbd/shared`. They do not hard-code seed values such as counts of events, except the status-tab counts in `mandates.spec.ts`.

## Selectors

Tests find elements only with `data-testid`, through `byId(page, id)`. The ids are the `TEST_IDS` constant in `shared/src/testIds.ts`. The frontend uses the same constant, so a renamed id fails the typecheck rather than a test run.

## Navigation

The app keeps navigation in React state, not in the URL. A page reload returns to the search screen. Every test therefore starts with `openApp()` (go to `/`, wait for the CRN input) and navigates through the UI. `openPayTo()` goes from the search screen to the PayTo tab of a customer.

## What the tests cover

`customer.spec.ts`
- With dev auth, the app lands on the search screen.
- A stubbed 403 from `/api/launch` shows the not-authorised screen. This uses `page.route`, so it needs no backend change.
- Searching the individual fixture CRN shows the customer name.
- An unknown CRN shows the "no customer found" banner.
- The simulated-500 CRN shows a system error banner, not the not-found one.

`mandates.spec.ts`
- The individual customer's mandates appear on the Active, Paused, Cancelled and Created tabs with counts 4, 1, 1 and 1.
- An active mandate with a pending amendment shows the "Action required" and "Updated" badges.
- Cancelling an active mandate adds exactly one history row, moves the mandate to the Cancelled tab and leaves three on the Active tab.
- Retrying a cancel after a lost response does not add a second history row. The test lets the first cancel request reach the server and aborts the response with `route.abort('connectionreset')`. It clicks confirm again and asserts that both requests carried the same `Idempotency-Key` header (`IDEMPOTENCY_HEADER` in `@mbd/shared`) and that the history grew by one row.

## CI

The `e2e` job in `.github/workflows/ci.yml` runs after the `verify` job (typecheck, lint, unit tests and build). It does the following:

1. `npm ci`
2. `docker compose up -d dynamodb-local`
3. `npx playwright install --with-deps chromium` in `e2e/`
4. `npm test -w e2e`

On failure it uploads `e2e/playwright-report` and `e2e/test-results` as the `playwright-report` artifact for 7 days. In CI the config retries a failed test once, uses the `github` and `html` reporters, and keeps a trace for failures (`trace: 'retain-on-failure'`).

## Limits to know about

- Chromium is the only browser project.
- No test covers the real Cognito login, the deployed API Gateway or the Lambda bundles. The backend runs through `tsx` with the local dev server, not as built Lambda handlers.
- Ports, the endpoint and the table name are constants in `support/env.ts`. Running two suites at once on one machine fails on a port clash.
- `e2e/tsconfig.json` is typechecked by `npm run typecheck`. There is no lint script for `e2e/`.