import {
  CreateTableCommand,
  DescribeTableCommand,
  ResourceNotFoundException,
  UpdateTimeToLiveCommand,
  type DynamoDBClient
} from '@aws-sdk/client-dynamodb'
import { BatchWriteCommand, DynamoDBDocumentClient, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { TTL_SPECIFICATION, createTableInput } from '@mbd/shared'
import { allItems } from './fixtures.js'

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
 * It never deletes, so items a running app added (events, idempotency records) survive; use resetAndSeed for a clean slate.
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
