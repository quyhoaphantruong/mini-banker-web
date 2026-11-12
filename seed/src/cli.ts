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
