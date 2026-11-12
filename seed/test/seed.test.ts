import { execFileSync } from 'node:child_process'
import { DeleteTableCommand, DynamoDBClient, ResourceNotFoundException } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { FIXTURE_CUSTOMERS } from '@mbd/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MANDATE_IDS, allItems, ensureTable, fixtures, seedTable } from '../src/index.js'

const TABLE = 'bdsmini-seed-test'
let containerId: string | undefined
let client: DynamoDBClient
let doc: DynamoDBDocumentClient

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function scanAll(): Promise<Record<string, any>[]> {
  const out: Record<string, any>[] = []
  let startKey: Record<string, unknown> | undefined
  do {
    const page = await doc.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey: startKey }))
    out.push(...(page.Items ?? []))
    startKey = page.LastEvaluatedKey
  } while (startKey)
  return out.sort((a, b) => `${a['PK']}|${a['SK']}`.localeCompare(`${b['PK']}|${b['SK']}`))
}

beforeAll(async () => {
  let endpoint = process.env['TEST_DYNAMODB_ENDPOINT']
  if (!endpoint) {
    containerId = execFileSync('docker', ['run', '-d', '--rm', '-p', '127.0.0.1::8000', 'amazon/dynamodb-local']).toString().trim()
    const mapped = execFileSync('docker', ['port', containerId, '8000/tcp']).toString().trim().split('\n')[0] ?? ''
    const port = mapped.slice(mapped.lastIndexOf(':') + 1)
    endpoint = `http://127.0.0.1:${port}`
  }
  client = new DynamoDBClient({
    region: 'ap-southeast-2',
    endpoint,
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' }
  })
  doc = DynamoDBDocumentClient.from(client)
  let ready = false
  for (let i = 0; i < 60 && !ready; i++) {
    try {
      await client.send(new DeleteTableCommand({ TableName: 'probe' }))
    } catch (e) {
      if (e instanceof ResourceNotFoundException) ready = true
      else await sleep(500)
    }
  }
  if (!ready) throw new Error('DynamoDB Local did not become ready')
  await ensureTable(client, TABLE)
})

afterAll(() => {
  if (containerId) execFileSync('docker', ['rm', '-f', containerId])
})

describe('seed (dynamodb-local)', () => {
  it('is idempotent', async () => {
    await seedTable(client, TABLE)
    const first = await scanAll()
    await seedTable(client, TABLE)
    const second = await scanAll()
    expect(first).toHaveLength(allItems.length)
    expect(second).toHaveLength(allItems.length)
    expect(second).toEqual(first)
  })

  it('keeps customer mandate summaries consistent with META', async () => {
    await seedTable(client, TABLE)
    const items = await scanAll()
    const summaries = items.filter(
      (i) => i['PK'] === `CUST#${FIXTURE_CUSTOMERS.individual.capId}` && String(i['SK']).startsWith('MANDATE#')
    )
    expect(summaries).toHaveLength(Object.keys(MANDATE_IDS).length)
    for (const s of summaries) {
      const meta = items.find((i) => i['PK'] === `MANDATE#${s['mandateId']}` && i['SK'] === 'META')
      expect(meta).toBeDefined()
      for (const f of ['status', 'initiator', 'shortDescription', 'amountCents', 'maxAmountCents', 'frequency', 'amountType', 'capId']) {
        expect(s[f]).toEqual(meta![f])
      }
      expect(s['hasPendingAmendment']).toBe(meta!['pendingAmendment'] !== null)
    }
  })

  it('lists the four active mandates through GSI2', async () => {
    await seedTable(client, TABLE)
    const res = await doc.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :p',
        ExpressionAttributeValues: { ':p': `CUST#${FIXTURE_CUSTOMERS.individual.capId}#ACTIVE` }
      })
    )
    const ids = (res.Items ?? []).map((i) => i['mandateId']).sort()
    expect(ids).toEqual(
      [MANDATE_IDS.activeFixed, MANDATE_IDS.activeVariable, MANDATE_IDS.activeUsage, MANDATE_IDS.activeBalance].sort()
    )
  })
})

describe('fixture shapes', () => {
  it('has a mandate with at least 5 events', () => {
    const counts = new Map<string, number>()
    for (const e of fixtures.events) counts.set(e.mandateId, (counts.get(e.mandateId) ?? 0) + 1)
    expect(Math.max(...counts.values())).toBeGreaterThanOrEqual(5)
  })

  it('has 5 to 10 transactions', () => {
    expect(fixtures.transactions.length).toBeGreaterThanOrEqual(5)
    expect(fixtures.transactions.length).toBeLessThanOrEqual(10)
  })

  it('has activeFixed migrated with a pending amendment due after now', () => {
    const m = fixtures.mandateMetas.find((x) => x.mandateId === MANDATE_IDS.activeFixed)!
    expect(m.status).toBe('ACTIVE')
    expect(m.migratedFromDirectDebit).toBe(true)
    expect(m.pendingAmendment).not.toBeNull()
    expect(Date.parse(m.pendingAmendment!.respondBy)).toBeGreaterThan(Date.parse(fixtures.now))
  })

  it('only ACTIVE mandates carry a pending amendment', () => {
    for (const m of fixtures.mandateMetas) {
      if (m.pendingAmendment) expect(m.status).toBe('ACTIVE')
    }
  })
})
