import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { ensureTable, resetAndSeed } from '@mbd/seed'
import { DYNAMODB_ENDPOINT, REGION, TABLE_NAME } from './env.js'

const client = new DynamoDBClient({
  region: REGION,
  endpoint: DYNAMODB_ENDPOINT,
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' }
})

/** Ensures the table exists, deletes everything, then loads the fixtures. */
export async function reseed(): Promise<void> {
  await ensureTable(client, TABLE_NAME)
  await resetAndSeed(client, TABLE_NAME)
}
