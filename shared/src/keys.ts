import type { AccountNo, CapId, Crn, IsoTimestamp, MandateId, MandateStatus } from "./types.js";

/** Table attribute names. The DynamoDB table 'bdsmini' has exactly these keys and indexes. */
export const TABLE = {
  pk: "PK",
  sk: "SK",
  gsi1: { name: "GSI1", pk: "GSI1PK", sk: "GSI1SK" },
  gsi2: { name: "GSI2", pk: "GSI2PK", sk: "GSI2SK" },
  ttl: "ttl",
} as const;

export const customerPk = (capId: CapId) => `CUST#${capId}`;
export const crnPk = (crn: Crn) => `CRN#${crn}`;
export const mandatePk = (id: MandateId) => `MANDATE#${id}`;
export const idempotencyPk = (key: string) => `IDEMP#${key}`;

export const SK = {
  profile: "PROFILE",
  crnMap: "MAP",
  mandateMeta: "META",
  idempotencyLock: "LOCK",
  account: (no: AccountNo) => `ACCT#${no}`,
  accountPrefix: "ACCT#",
  customerMandate: (id: MandateId) => `MANDATE#${id}`,
  customerMandatePrefix: "MANDATE#",
  event: (at: IsoTimestamp, seq: number) => `EVENT#${at}#${String(seq).padStart(4, "0")}`,
  eventPrefix: "EVENT#",
  txn: (at: IsoTimestamp) => `TXN#${at}`,
  txnPrefix: "TXN#",
} as const;

/** GSI1 finds a customer by account number. */
export const gsi1ForAccount = (no: AccountNo, capId: CapId) => ({
  GSI1PK: `ACCT#${no}`,
  GSI1SK: customerPk(capId),
});

/** GSI2 partition for one customer's mandates in one status. */
export const gsi2PkForStatus = (capId: CapId, status: MandateStatus) =>
  `${customerPk(capId)}#${status}`;

/** GSI2 lists a customer's mandates by status, ordered by mandate id (UUIDv7 is time-ordered). */
export const gsi2ForMandate = (
  capId: CapId,
  status: MandateStatus,
  id: MandateId,
) => ({
  GSI2PK: gsi2PkForStatus(capId, status),
  GSI2SK: mandatePk(id),
});

export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;