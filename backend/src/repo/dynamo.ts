import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { AppConfig } from "../config.js";

export interface Db {
  doc: DynamoDBDocumentClient;
  tableName: string;
}

export function createDb(
  config: Pick<AppConfig, "tableName" | "region" | "dynamodbEndpoint">,
): Db {
  const client = new DynamoDBClient({
    region: config.region,
    ...(config.dynamodbEndpoint
      ? {
          endpoint: config.dynamodbEndpoint,
          credentials: { accessKeyId: "local", secretAccessKey: "local" },
        }
      : {}),
  });
  const doc = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });
  return { doc, tableName: config.tableName };
}
