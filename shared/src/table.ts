import { TABLE } from "./keys.js";

export const TABLE_NAME_DEFAULT = "bdsmini";

/** Plain-object CreateTable input. Local scripts and tests use it. Terraform mirrors it in infra/modules/dynamodb. */
export const createTableInput = (tableName: string = TABLE_NAME_DEFAULT) => ({
  TableName: tableName,
  BillingMode: "PAY_PER_REQUEST" as const,
  AttributeDefinitions: [
    { AttributeName: TABLE.pk, AttributeType: "S" as const },
    { AttributeName: TABLE.sk, AttributeType: "S" as const },
    { AttributeName: TABLE.gsi1.pk, AttributeType: "S" as const },
    { AttributeName: TABLE.gsi1.sk, AttributeType: "S" as const },
    { AttributeName: TABLE.gsi2.pk, AttributeType: "S" as const },
    { AttributeName: TABLE.gsi2.sk, AttributeType: "S" as const },
  ],
  KeySchema: [
    { AttributeName: TABLE.pk, KeyType: "HASH" as const },
    { AttributeName: TABLE.sk, KeyType: "RANGE" as const },
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: TABLE.gsi1.name,
      KeySchema: [
        { AttributeName: TABLE.gsi1.pk, KeyType: "HASH" as const },
        { AttributeName: TABLE.gsi1.sk, KeyType: "RANGE" as const },
      ],
      Projection: { ProjectionType: "ALL" as const },
    },
    {
      IndexName: TABLE.gsi2.name,
      KeySchema: [
        { AttributeName: TABLE.gsi2.pk, KeyType: "HASH" as const },
        { AttributeName: TABLE.gsi2.sk, KeyType: "RANGE" as const },
      ],
      Projection: { ProjectionType: "ALL" as const },
    },
  ],
});

export const TTL_SPECIFICATION = { AttributeName: TABLE.ttl, Enabled: true };