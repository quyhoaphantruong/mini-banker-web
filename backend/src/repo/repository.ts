import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  type QueryCommandInput,
} from "@aws-sdk/lib-dynamodb";
import {
  SK,
  TABLE,
  crnPk,
  customerPk,
  gsi2PkForStatus,
  mandatePk,
  type AccountItem,
  type AccountNo,
  type CapId,
  type CrnMapItem,
  type Crn,
  type CustomerMandateItem,
  type CustomerProfileItem,
  type IdempotencyItem,
  type MandateEventItem,
  type MandateId,
  type MandateMetaItem,
  type MandateStatus,
  type MandateTxnItem,
} from "@mbd/shared";
import type { CancelPlan, StoredResponse } from "../domain/mandate.js";
import { cancelIdempotencyPk } from "../domain/mandate.js";
import type { CancelRepository, CommitOutcome } from "../domain/ports.js";
import type { Db } from "./dynamo.js";

export interface Repository extends CancelRepository {
  getCapIdForCrn(crn: Crn): Promise<CapId | null>;
  getProfile(capId: CapId): Promise<CustomerProfileItem | null>;
  listAccounts(capId: CapId): Promise<AccountItem[]>;
  findCapIdByAccount(accountNo: AccountNo): Promise<CapId | null>;
  listMandates(
    capId: CapId,
    status?: MandateStatus,
  ): Promise<CustomerMandateItem[]>;
  listEvents(mandateId: MandateId): Promise<MandateEventItem[]>;
  listTransactions(mandateId: MandateId): Promise<MandateTxnItem[]>;
}

const castItem = <T>(raw: unknown): T => raw as T;

export function createRepository(db: Db): Repository {
  const { doc, tableName } = db;

  async function getItem<T>(
    pk: string,
    sk: string,
    consistent = false,
  ): Promise<T | null> {
    const out = await doc.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK: pk, SK: sk },
        ConsistentRead: consistent,
      }),
    );
    return out.Item ? castItem<T>(out.Item) : null;
  }

  async function queryAll<T>(
    input: Omit<QueryCommandInput, "TableName">,
  ): Promise<T[]> {
    const items: T[] = [];
    let startKey: QueryCommandInput["ExclusiveStartKey"];
    do {
      const out = await doc.send(
        new QueryCommand({
          TableName: tableName,
          ...input,
          ExclusiveStartKey: startKey,
        }),
      );
      for (const item of out.Items ?? []) items.push(castItem<T>(item));
      startKey = out.LastEvaluatedKey;
    } while (startKey);
    return items;
  }

  const queryPrefix = <T>(pk: string, prefix: string, newestFirst: boolean) =>
    queryAll<T>({
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":pk": pk, ":prefix": prefix },
      ScanIndexForward: !newestFirst,
    });

  return {
    async getCapIdForCrn(crn) {
      const item = await getItem<CrnMapItem>(crnPk(crn), SK.crnMap);
      return item?.capId ?? null;
    },

    getProfile: (capId) =>
      getItem<CustomerProfileItem>(customerPk(capId), SK.profile),

    listAccounts: (capId) =>
      queryPrefix<AccountItem>(customerPk(capId), SK.accountPrefix, false),

    async findCapIdByAccount(accountNo) {
      const items = await queryAll<AccountItem>({
        IndexName: TABLE.gsi1.name,
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": `ACCT#${accountNo}` },
        Limit: 1,
      });
      return items[0]?.capId ?? null;
    },

    async listMandates(capId, status) {
      if (status) {
        return queryAll<CustomerMandateItem>({
          IndexName: TABLE.gsi2.name,
          KeyConditionExpression: "GSI2PK = :pk",
          ExpressionAttributeValues: { ":pk": gsi2PkForStatus(capId, status) },
          ScanIndexForward: false,
        });
      }
      return queryPrefix<CustomerMandateItem>(
        customerPk(capId),
        SK.customerMandatePrefix,
        true,
      );
    },

    getMandate: (mandateId) =>
      getItem<MandateMetaItem>(mandatePk(mandateId), SK.mandateMeta),

    listEvents: (mandateId) =>
      queryPrefix<MandateEventItem>(
        mandatePk(mandateId),
        SK.eventPrefix,
        false,
      ),

    listTransactions: (mandateId) =>
      queryPrefix<MandateTxnItem>(mandatePk(mandateId), SK.txnPrefix, false),

    async getStoredCancel(mandateId, key) {
      const item = await getItem<IdempotencyItem>(
        cancelIdempotencyPk(mandateId, key),
        SK.idempotencyLock,
      );
      return item ? castItem<StoredResponse>(JSON.parse(item.response)) : null;
    },

    async commitCancel(plan: CancelPlan): Promise<CommitOutcome> {
      const statusValues = Object.fromEntries(
        plan.cancellableFrom.map((s, i) => [`:from${i}`, s]),
      );
      const statusIn = `#status IN (${plan.cancellableFrom.map((_, i) => `:from${i}`).join(", ")})`;
      try {
        await doc.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Update: {
                  TableName: tableName,
                  Key: plan.mandateKey,
                  UpdateExpression:
                    "SET #status = :to, #version = :next, updatedAt = :at",
                  ConditionExpression: `${statusIn} AND #version = :expected`,
                  ExpressionAttributeNames: {
                    "#status": "status",
                    "#version": "version",
                  },
                  ExpressionAttributeValues: {
                    ...statusValues,
                    ":to": plan.toStatus,
                    ":next": plan.nextVersion,
                    ":expected": plan.expectedVersion,
                    ":at": plan.updatedAt,
                    ":gsi2sk": plan.summaryGsi2.GSI2SK,
                  },
                },
              },
              {
                Put: {
                  TableName: tableName,
                  Item: plan.event,
                  ConditionExpression: "attribute_not_exists(PK)",
                },
              },
              {
                Put: {
                  TableName: tableName,
                  Item: plan.idempotency,
                  ConditionExpression: "attribute_not_exists(PK)",
                },
              },
            ],
          }),
        );
        return { kind: "committed" };
      } catch (error) {
        if (error instanceof TransactionCanceledException) {
          const metaReason = error.CancellationReasons?.[0]?.Code;
          return {
            kind: "rejected",
            metaRejected: metaReason !== undefined && metaReason !== "None",
          };
        }
        throw error;
      }
    },
  };
}
