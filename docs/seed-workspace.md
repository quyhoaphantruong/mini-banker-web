# Seed workspace (`@mbd/seed`)

## Prerequisites in `@mbd/shared`

| Helper / Constant | Output |
|---|---|
| `customerPk(capId)` | `'CUST#<capId>'` |
| `crnPk(crn)` | `'CRN#<crn>'` |
| `mandatePk(id)` | `'MANDATE#<id>'` |
| `SK.profile` / `SK.crnMap` / `SK.mandateMeta` | `'PROFILE'` / `'MAP'` / `'META'` |
| `SK.account(no)` | `'ACCT#<no>'` |
| `SK.customerMandate(id)` | `'MANDATE#<id>'` |
| `SK.event(at, seq)` | `'EVENT#<at>#<seq padded to 4 digits>'` |
| `SK.txn(at)` | `'TXN#<at>'` |
| `gsi1ForAccount(no, capId)` | `{ GSI1PK: 'ACCT#<no>', GSI1SK: 'CUST#<capId>' }` |
| `gsi2ForMandate(capId, status, id)` | `{ GSI2PK: 'CUST#<capId>#<status>', GSI2SK: 'MANDATE#<id>' }` |

## Files

```text
seed/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    index.ts         re-exports fixtures.js and seedTable.js
    fixtures.ts      all data (about 490 lines)
    seedTable.ts     ensureTable, seedTable, resetAndSeed
    cli.ts           npm run seed entry point
  test/
    seed.test.ts     integration tests against dynamodb-local
```

The root `package.json` lists `'seed'` in `workspaces`. Run `npm install` at the root after you create it.

### `package.json`

```json
{
  "name": "@mbd/seed",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "seed": "tsx src/cli.ts",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.1161.0",
    "@aws-sdk/lib-dynamodb": "^3.1161.0",
    "@mbd/shared": "*"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.23.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

Like `@mbd/shared`, it is consumed as TypeScript source with no build step. There is no build or lint script.

### `tsconfig.json`

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "noEmit": true, "lib": ["ES2022"], "types": ["node"] },
  "include": ["src", "test"]
}
```

### `vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { testTimeout: 30_000, hookTimeout: 120_000, fileParallelism: false }
})
```

### `src/index.ts`

```ts
export * from './fixtures.js'
export * from './seedTable.js'
```

### `src/cli.ts`

```ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { TABLE_NAME_DEFAULT } from '@mbd/shared'
import { ensureTable, seedTable } from './seedTable.js'

const endpoint = process.env['DYNAMODB_ENDPOINT']
const tableName = process.env['TABLE_NAME'] ?? TABLE_NAME_DEFAULT
const region = process.env['AWS_REGION'] ?? 'ap-southeast-2'

// Seeding real AWS overwrites fixture keys, so it needs an explicit opt-in.
if (!endpoint && process.env['SEED_ALLOW_AWS'] !== '1') {
  console.error('Refusing to seed real AWS. Set DYNAMODB_ENDPOINT for local DynamoDB, or SEED_ALLOW_AWS=1 to confirm.')
  process.exit(1)
}

const client = new DynamoDBClient({
  region,
  ...(endpoint ? { endpoint, credentials: { accessKeyId: 'local', secretAccessKey: 'local' } } : {})
})

// Only local DynamoDB gets its table created here. Real AWS tables belong to Terraform.
if (endpoint) await ensureTable(client, tableName)
const count = await seedTable(client, tableName)
console.log(`Seeded ${count} items into ${tableName}${endpoint ? ` at ${endpoint}` : ''}`)
```

Behaviour:

- No `DYNAMODB_ENDPOINT` and no `SEED_ALLOW_AWS=1`: print the error and exit 1.
- With an endpoint: use dummy credentials, create the table if missing, then seed.
- Without an endpoint (and `SEED_ALLOW_AWS=1`): use the default AWS credential chain. The table must already exist (Terraform owns it).
- Defaults: table `bdsmini`, region `ap-southeast-2`.

### `src/seedTable.ts`

Imports:

- `CreateTableCommand`, `DescribeTableCommand`, `ResourceNotFoundException`, `UpdateTimeToLiveCommand`, `type DynamoDBClient` from `@aws-sdk/client-dynamodb`
- `BatchWriteCommand`, `DynamoDBDocumentClient`, `PutCommand`, `ScanCommand` from `@aws-sdk/lib-dynamodb`
- `TTL_SPECIFICATION`, `createTableInput` from `@mbd/shared`
- `allItems` from `./fixtures.js`

```ts
export async function ensureTable(client: DynamoDBClient, tableName: string): Promise<void> {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }))
    return
  } catch (e) {
    if (!(e instanceof ResourceNotFoundException)) throw e
  }
  await client.send(new CreateTableCommand(createTableInput(tableName)))
  await client.send(new UpdateTimeToLiveCommand({ TableName: tableName, TimeToLiveSpecification: TTL_SPECIFICATION }))
}

/**
 * Loads every fixture with PutItem on its deterministic key, so a second run overwrites identical items.
 * It never deletes, so items a running app added (events, idempotency records) survive; use resetTable for a clean slate.
 */
export async function seedTable(client: DynamoDBClient, tableName: string): Promise<number> {
  const doc = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } })
  for (const item of allItems) {
    await doc.send(new PutCommand({ TableName: tableName, Item: item }))
  }
  return allItems.length
}

/** Deletes every item, then seeds. Tests call this in beforeEach so mutations from earlier tests vanish. */
export async function resetAndSeed(client: DynamoDBClient, tableName: string): Promise<number> {
  const doc = DynamoDBDocumentClient.from(client)
  let startKey: Record<string, unknown> | undefined
  do {
    const page = await doc.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: 'PK, SK',
        ExclusiveStartKey: startKey
      })
    )
    const keys = page.Items ?? []
    for (let i = 0; i < keys.length; i += 25) {
      await doc.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: keys.slice(i, i + 25).map((k) => ({ DeleteRequest: { Key: { PK: k['PK'], SK: k['SK'] } } }))
          }
        })
      )
    }
    startKey = page.LastEvaluatedKey
  } while (startKey)
  return seedTable(client, tableName)
}
```

Properties to preserve:

- **Idempotent:** every item has a deterministic key, so `seedTable` overwrites with identical content on a re-run.
- **Non-destructive:** `seedTable` never deletes. Anything the app wrote under other keys (new events, idempotency records) survives. Overwriting a fixture mandate does revert it.
- `resetAndSeed` scans the whole table (paginated), deletes in batches of 25, then calls `seedTable`. The `seedTable` doc comment mentions `resetTable`, which does not exist; the real name is `resetAndSeed`.
- `ensureTable` also enables TTL on the `ttl` attribute, which the idempotency records use.

## Fixture data (`src/fixtures.ts`)

`fixtures.ts` exports: `FIXTURE_NOW`, `MANDATE_IDS`, `ACCOUNT_NOS`, `fixtures` and `allItems`.

### Constants

```ts
export const FIXTURE_NOW: IsoTimestamp = '2026-11-08T00:00:00.000Z'
```

All fixture timestamps are fixed strings relative to this fake clock, never `Date.now()`. That keeps the data identical on every run. The pending amendment's `respondBy` must stay later than `FIXTURE_NOW`; a seed test checks it.

`MANDATE_IDS` are hard-coded UUIDv7-shaped strings (version nibble 7, variant 8). Each is cast as `MandateId`. The whole object is `as const`.

| Key | Value |
|---|---|
| `activeFixed` | `'01931b5e-7a00-7000-8000-000000000001'` |
| `activeVariable` | `'01931b5e-7a00-7000-8000-000000000002'` |
| `activeUsage` | `'01931b5e-7a00-7000-8000-000000000003'` |
| `activeBalance` | `'01931b5e-7a00-7000-8000-000000000004'` |
| `paused` | `'01931b5e-7a00-7000-8000-000000000005'` |
| `cancelled` | `'01931b5e-7a00-7000-8000-000000000006'` |
| `created` | `'01931b5e-7a00-7000-8000-000000000007'` |

`ACCOUNT_NOS` (each cast as `AccountNo`): `everyday = '123456781'`, `savings = '123456782'`, `business = '223456781'`. All accounts use BSB `'013-102'`. All addresses use country `'AU'`.

### Item counts

| Entity | Count |
|---|---|
| `CRN_MAP` | 3 |
| `PROFILE` | 3 |
| `ACCOUNT` | 3 |
| `CUSTOMER_MANDATE` | 7 |
| `MANDATE_META` | 7 |
| `MANDATE_EVENT` | 12 |
| `MANDATE_TXN` | 8 |
| **Total** | **43** |

`allItems` order (it matters only for readability): crnMaps, customers, accounts, customerMandates, mandateMetas, events, transactions. Its type is `readonly TableItem[]`.

`fixtures` is `{ now, customers, crnMaps, accounts, mandateMetas, customerMandates, events, transactions } as const`.

### Customers (`PROFILE`)

Key: `PK = CUST#<capId>`, `SK = PROFILE`, `entity = 'PROFILE'`.

| Field | individual | business | noAccounts |
|---|---|---|---|
| `capId` | `'7000000001'` | `'7000000002'` | `'7000000003'` |
| `crn` | `'100000001'` | `'100000002'` | `'100000003'` |
| `fullName` | Alex Testperson | Fakeco Trading Pty Ltd | Sam Noaccounts |
| `customerType` | Individual | Business | Individual |
| `kycStatus` | Complete | Complete | Incomplete |
| `verificationStatus` | Verified | Verified | Unverified |
| `dob` | `'1985-04-12'` | omitted (no key) | `'1992-09-30'` |
| `address.line1` | 1 Example Street | 22 Demo Road | 3 Placeholder Lane |
| `address.suburb` | Sampleville | Mockton | Dummytown |
| `address.state` | VIC | NSW | QLD |
| `address.postcode` | 3000 | 2000 | 4000 |
| `address.country` | AU | AU | AU |

### CRN map (`CRN_MAP`)

Generated from `Object.values(FIXTURE_CUSTOMERS)`: `PK = CRN#<crn>`, `SK = MAP`, `entity = 'CRN_MAP'`, `capId`.

### Accounts (`ACCOUNT`)

Key: `PK = CUST#<capId>`, `SK = ACCT#<accountNo>`. Every account has `entity = 'ACCOUNT'`, `bsb = '013-102'`, `status = 'OPEN'`, plus `GSI1PK = ACCT#<accountNo>` and `GSI1SK = CUST#<capId>`.

| Owner | `accountNo` | Description | `balanceCents` |
|---|---|---|---|
| individual | `'123456781'` | Everyday Account | 245075 |
| individual | `'123456782'` | Online Saver | 1250000 |
| business | `'223456781'` | Business Transaction Account | 8912340 |

The `noAccounts` customer has none.

### Mandates

Each mandate spec produces two items. All seven belong to the individual customer (`capId` `7000000001`).

**`MANDATE_META`** has `PK = MANDATE#<id>`, `SK = META`, `entity = 'MANDATE_META'`. Fixed or derived fields, the same for every mandate:

| Field | Value |
|---|---|
| `capId` | `'7000000001'` |
| `paymentReference` | `'REF-'` plus the last 4 characters of the id (`'REF-0001'` to `'REF-0007'`) |
| `payerName` | `'Alex Testperson'` |
| `ultimatePayer` | `null` |
| `bsb` | `'013-102'` |
| `firstPaymentAmountCents`, `firstPaymentDate`, `lastPaymentAmountCents`, `lastPaymentDate` | From `firstPayment` and `lastPayment` if present, otherwise `null` |

**`CUSTOMER_MANDATE`** is a summary copy derived from the META item. It has `PK = CUST#<capId>`, `SK = MANDATE#<id>`, `entity = 'CUSTOMER_MANDATE'`. Its fields are `capId`, `mandateId`, `initiator`, `shortDescription`, `maxAmountCents`, `amountCents`, `frequency`, `amountType`, `status`, `hasPendingAmendment` (`pendingAmendment !== null`), plus `GSI2PK = CUST#<capId>#<status>` and `GSI2SK = MANDATE#<id>`. Build it from the META item with a function, so the two cannot drift. A seed test checks that they agree.

Per-mandate data (`amt` = `amountCents`, `max` = `maxAmountCents`; `-` means `null` or none).

**Active mandates**

| Field | `activeFixed` | `activeVariable` | `activeUsage` | `activeBalance` |
|---|---|---|---|---|
| `status` | ACTIVE | ACTIVE | ACTIVE | ACTIVE |
| `initiator` | Sampleco Energy | Demo Telecom | Pretend Water Authority | Make-Believe Credit Cards |
| `shortDescription` | Electricity bill | Mobile plan | Water usage | Card repayment |
| `description` | Fixed monthly electricity payment to Sampleco Energy | Variable monthly mobile plan charges to Demo Telecom | Usage-based quarterly water charges | Pay the outstanding card balance each month |
| `purpose` | Utilities | Telecommunications | Utilities | Loan repayment |
| `amountType` | FIXE | VARI | USGB | BALN |
| `frequency` | MONTHLY | MONTHLY | QUARTERLY | MONTHLY |
| `amt` | 18000 | - | - | - |
| `max` | 18000 | 15000 | 40000 | 300000 |
| `conditionsOfPayment` | - | Charged after each billing cycle. | - | Statement balance, capped at the maximum amount. |
| `firstPayment` / `lastPayment` | - | - | - | - |
| `startDate` | 2026-01-15 | 2026-02-01 | 2026-03-01 | 2026-04-05 |
| `endDate` | - | - | 2028-03-01 | - |
| `autoRenew` | true | true | false | true |
| `migratedFromDirectDebit` | true | false | false | false |
| `pendingAmendment` | `AMENDMENT` (below) | - | - | - |
| `accountNo` | 123456781 | 123456781 | 123456782 | 123456781 |
| `createdAt` | 2026-01-10T01:00:00.000Z | 2026-01-25T01:00:00.000Z | 2026-02-20T01:00:00.000Z | 2026-03-30T01:00:00.000Z |
| `updatedAt` | 2026-01-12T01:00:00.000Z | 2026-01-26T01:00:00.000Z | 2026-02-21T01:00:00.000Z | 2026-03-31T01:00:00.000Z |
| `version` | 2 | 2 | 2 | 2 |

**Other mandates**

| Field | `paused` | `cancelled` | `created` |
|---|---|---|---|
| `status` | PAUSED | CANCELLED | CREATED |
| `initiator` | Fictional Streaming Co | Imaginary Insurance | Example Gym Group |
| `shortDescription` | Streaming subscription | Contents insurance | Gym membership |
| `description` | Monthly streaming subscription | Annual contents insurance premium | Monthly gym membership migrated from... (cut off in the source) |
| `purpose` | Entertainment | Insurance | Health and fitness |
| `amountType` | FIXE | FIXE | FIXE |
| `frequency` | MONTHLY | ANNUALLY | MONTHLY |
| `amt` | 1699 * | 92000 * | 5500 |
| `max` | 1699 * | 92000 * | 5500 |
| `conditionsOfPayment` | - | - | Standard tier billed monthly. |
| `firstPayment` | - | - | 5500 on 2026-11-15 |
| `lastPayment` | - | - | 5500 on 2027-10-15 |
| `startDate` | 2026-05-01 | 2025-06-01 | 2026-11-15 |
| `endDate` | - | 2026-06-01 | 2027-10-31 |
| `autoRenew` | true | false | false |
| `migratedFromDirectDebit` | false | false | false |
| `pendingAmendment` | - | - | - |
| `accountNo` | 123456781 | 123456782 | 123456781 |
| `createdAt` | 2026-04-25T01:00:00.000Z | 2025-05-20T01:00:00.000Z | 2026-11-03T01:00:00.000Z |
| `updatedAt` | 2026-08-01T01:00:00.000Z | 2026-06-15T01:00:00.000Z | 2026-11-05T02:00:00.000Z |
| `version` | 3 | 3 | 1 |

\* The source ran these digits together (`1699920005500`). I split them as 1699 / 92000 / 5500 ($16.99, $920.00, $55.00). Check against `fixtures.ts`.

Status mix: 4 ACTIVE, 1 PAUSED, 1 CANCELLED, 1 CREATED. The e2e tab counts (4, 1, 1, 1) depend on it.

**`AMENDMENT`** (only on `activeFixed`, so only ACTIVE mandates carry one):

```ts
{
  proposedAt: '2026-11-05T02:00:00.000Z',
  // 30 days after FIXTURE_NOW
  respondBy: '2026-12-08T00:00:00.000Z',
  changes: {
    amountCents: 6_500,
    maxAmountCents: 9_000,
    shortDescription: 'Gym membership (premium)',
    conditionsOfPayment: 'Premium tier billed monthly, cancel with 14 days notice.',
    firstPaymentAmountCents: 6_500,
    firstPaymentDate: '2026-12-15',
    lastPaymentAmountCents: 6_500,
    lastPaymentDate: '2027-11-15',
    endDate: '2027-11-30'
  }
}
```

The comment says 30 days, but 2026-12-08 is 30 days after 2026-11-08. Keep the value.

### Events (`MANDATE_EVENT`)

Key: `PK = MANDATE#<id>`, `SK = EVENT#<at>#<index+1 padded to 4 digits>`. The index restarts at 1 for each mandate. Other fields: `entity = 'MANDATE_EVENT'`, `mandateId`, `at`, `action`, `fromStatus`, `toStatus`, `reasonCode` (or `null`), `reasonDescription` (from shared, or `null` when there is no code), `actor`, and `requestId = seed-<last 4 of id>-<index+1 padded to 2 digits>` (for example `'seed-0005-02'`).

Actor values: `'customer'`, `'system'`, `'banker.demo'`.

| Mandate | # | `at` | `action` | From to To | `reasonCode` | `actor` |
|---|---|---|---|---|---|---|
| `activeFixed` | 1 | 2026-01-10T01:00:00.000Z | accept | CREATED to ACTIVE | - | customer |
| `activeVariable` | 1 | 2026-01-25T01:00:00.000Z | accept | CREATED to ACTIVE | - | customer |
| `activeUsage` | 1 | 2026-02-20T01:00:00.000Z | accept | CREATED to ACTIVE | - | customer |
| `activeBalance` | 1 | 2026-03-30T01:00:00.000Z | accept | CREATED to ACTIVE | - | customer |
| `paused` | 1 | 2026-04-25T01:00:00.000Z | accept | CREATED to ACTIVE | - | customer |
| `paused` | 2 | 2026-05-20T01:00:00.000Z | pause | ACTIVE to PAUSED | AC02 | system |
| `paused` | 3 | 2026-06-02T01:00:00.000Z | resume | PAUSED to ACTIVE | - | banker.demo |
| `paused` | 4 | 2026-07-10T01:00:00.000Z | amend | ACTIVE to ACTIVE | AM12 | system |
| `paused` | 5 | 2026-08-01T01:00:00.000Z | pause | ACTIVE to PAUSED | AC13 | system |
| `cancelled` | 1 | 2025-05-20T01:00:00.000Z | accept | CREATED to ACTIVE | - | customer |
| `cancelled` | 2 | 2026-03-01T01:00:00.000Z | pause | ACTIVE to PAUSED | - | banker.demo |
| `cancelled` | 3 | 2026-06-15T01:00:00.000Z | cancel | PAUSED to CANCELLED | MD16 | banker.demo |

The `created` mandate has no events. The `paused` mandate holds the longest history (5 events); a seed test requires at least 5 events.

Reason texts, from `shared/src/reasonCodes.ts`:

- `MD16`: Cancelled on customer request
- `AM12`: Cancelled by bank system
- `AC02`: ... due to account unavailability
- `AC05`: ... due to account closure
- `AC13`: ... due to ineligible account

### Transactions (`MANDATE_TXN`)

All eight belong to `activeFixed`. Key: `PK = MANDATE#01931b5e-7a00-7000-8000-000000000001`, `SK = TXN#<at>`. Fields: `entity = 'MANDATE_TXN'`, `mandateId`, `at`, `description`, `amountCents`, `status`.

| `at` | `description` | `amountCents` | `status` |
|---|---|---|---|
| 2026-05-15T00:00:00.000Z | Sampleco Energy May | 17650 | POSTED |
| 2026-06-15T00:00:00.000Z | Sampleco Energy Jun | 18000 | POSTED |
| 2026-07-15T00:00:00.000Z | Sampleco Energy Jul | 18000 | POSTED |
| 2026-08-15T00:00:00.000Z | Sampleco Energy Aug | 18000 | FAILED |
| 2026-08-18T00:00:00.000Z | Sampleco Energy Aug retry | 18000 | POSTED |
| 2026-09-15T00:00:00.000Z | Sampleco Energy Sep | 18000 | POSTED |
| 2026-10-15T00:00:00.000Z | Sampleco Energy Oct | 18000 | POSTED |
| 2026-11-15T00:00:00.000Z | Sampleco Energy Nov | 18000 | PENDING |

Money is always integer cents.

### Suggested structure of `fixtures.ts`

The original file is a flat module of typed arrays:

1. `customers`, `crnMaps`
2. an `account()` helper and `accounts`
3. a `MandateSpec` type and a `specs` array
4. `metaOf(spec)` and `summaryOf(meta)`
5. an `eventsFor(id, eventSpecs)` helper with its events array
6. `TXN_SPECS` and `transactions`
7. the final `fixtures` and `allItems` exports

`MandateSpec` carries `firstPayment` and `lastPayment` as `{ amountCents, date }` objects. Deriving META and summary from one spec array is the design choice that keeps the two copies in sync.

## Tests (`test/seed.test.ts`)

An integration suite against dynamodb-local, using table `'bdsmini-seed-test'`.

**Setup**

- If `TEST_DYNAMODB_ENDPOINT` is set, use it. Otherwise `beforeAll` starts a throwaway container: `docker run -d --rm -p 127.0.0.1::8000 amazon/dynamodb-local`. It reads the mapped port with `docker port <id> 8000/tcp` and builds `http://127.0.0.1:<port>`.
- It polls (up to 60 tries, 500 ms apart) with a `DeleteTable` call on a table named `'probe'`. A `ResourceNotFoundException` means DynamoDB is ready.
- It then calls `ensureTable`. `afterAll` removes the container with `docker rm -f`.
- Client: region `'ap-southeast-2'`, dummy credentials `'local'` / `'local'`.

**Cases**

- **Idempotent:** seed, scan, seed again, scan. Both scans have `allItems.length` items and the same content after sorting by PK/SK.
- **Summary matches META:** the individual customer's `MANDATE#` items number `Object.keys(MANDATE_IDS).length`. For each, the META item agrees on `status`, `initiator`, `shortDescription`, `amountCents`, `maxAmountCents`, `frequency`, `amountType`, `hasPendingAmendment` and `capId`.
- **GSI2:** querying `'CUST#7000000001#ACTIVE'` returns exactly the four active mandate ids.
- **Shapes (no database):**
  - at least one mandate has 5 or more events
  - 5 to 10 transactions
  - `activeFixed` is ACTIVE, `migratedFromDirectDebit` is true, and it has a pending amendment whose `respondBy` is after `fixtures.now`
  - every mandate with a pending amendment is ACTIVE

## Verify a rebuild

```bash
npm install
npm run typecheck -w seed
npm test -w seed                       # needs Docker, or TEST_DYNAMODB_ENDPOINT

docker compose up -d dynamodb-local
export DYNAMODB_ENDPOINT=http://localhost:8000 AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local AWS_REGION=ap-southeast-2
npm run seed -w seed                   # prints: Seeded 43 items into bdsmini at http://localhost:8000
npm run seed -w seed                   # run twice; the output must be identical
```

Then run `npm test -w e2e`. It exercises the fixtures through the real UI and fails if counts, ids or names drift. The e2e and backend suites are the real check that a rebuilt seed matches.

## Gotchas

- `resetAndSeed` and `seedTable` take a `DynamoDBClient`, not a document client. They build the document client internally.
- `seedTable` sets `removeUndefinedValues: true`; `resetAndSeed` builds a plain document client for the scan and delete steps. The business `PROFILE` omits `dob` instead of setting it to `undefined`.
- The default table name is `'bdsmini'` in the CLI, e2e and the dev server. The seed test uses `'bdsmini-seed-test'` so it never touches the dev table.
- The seed refuses to touch real AWS unless `SEED_ALLOW_AWS=1`. It also never creates a real AWS table; Terraform (`infra/modules/dynamodb`) owns it and mirrors `createTableInput()`.
- `.DS_Store` files in `seed/` are macOS noise. Ignore them.
