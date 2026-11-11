import {
  CANCELLABLE_FROM,
  IDEMPOTENCY_TTL_SECONDS,
  REASON_CODES,
  SK,
  customerPk,
  gsi2ForMandate,
  idempotencyPk,
  mandatePk,
  nextStatus,
  type CancelMandateResponse,
  type CapId,
  type IdempotencyItem,
  type MandateDetailDto,
  type MandateEventItem,
  type MandateId,
  type MandateMetaItem,
  type MandateStatus,
  type ReasonCode,
} from "@mbd/shared";

export interface StoredResponse {
  statusCode: number;
  body: CancelMandateResponse;
}

export interface CancelCommand {
  mandateId: MandateId;
  idempotencyKey: string;
  actor: string;
  requestId: string;
  reasonCode: ReasonCode;
  now: Date;
}

export interface CancelPlan {
  mandateKey: { PK: string; SK: string };
  summaryKey: { PK: string; SK: string };
  cancellableFrom: readonly MandateStatus[];
  expectedVersion: number;
  nextVersion: number;
  toStatus: MandateStatus;
  updatedAt: string;
  summaryGsi2: { GSI2PK: string; GSI2SK: string };
  event: MandateEventItem;
  idempotency: IdempotencyItem;
}

export type CancelPlanResult =
  | { kind: "plan"; plan: CancelPlan; response: StoredResponse }
  | { kind: "invalid-transition"; from: MandateStatus };

export const cancelIdempotencyPk = (mandateId: MandateId, key: string) => idempotencyPk(`${mandateId}#cancel#${key}`);

export function toMandateDetailDto(meta: MandateMetaItem): MandateDetailDto {
  return {
    mandateId: meta.mandateId,
    capId: meta.capId,
    initiator: meta.initiator,
    description: meta.description,
    shortDescription: meta.shortDescription,
    purpose: meta.purpose,
    paymentReference: meta.paymentReference,
    conditionsOfPayment: meta.conditionsOfPayment,
    amountCents: meta.amountCents,
    maxAmountCents: meta.maxAmountCents,
    firstPaymentAmountCents: meta.firstPaymentAmountCents,
    firstPaymentDate: meta.firstPaymentDate,
    lastPaymentAmountCents: meta.lastPaymentAmountCents,
    lastPaymentDate: meta.lastPaymentDate,
    frequency: meta.frequency,
    amountType: meta.amountType,
    startDate: meta.startDate,
    endDate: meta.endDate,
    autoRenew: meta.autoRenew,
    migratedFromDirectDebit: meta.migratedFromDirectDebit,
    payerName: meta.payerName,
    ultimatePayer: meta.ultimatePayer,
    accountNo: meta.accountNo,
    bsb: meta.bsb,
    status: meta.status,
    version: meta.version,
    pendingAmendment: meta.pendingAmendment,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  };
}

export function planCancel( meta: MandateMetaItem, cmd: CancelCommand): CancelPlanResult {
  const toStatus = nextStatus(meta.status, "cancel");
  if (toStatus === null)
    return { kind: "invalid-transition", from: meta.status };

  const at = cmd.now.toISOString();
  const nextVersion = meta.version + 1;
  const capId: CapId = meta.capId;

  const event: MandateEventItem = {
    PK: mandatePk(meta.mandateId),
    SK: SK.event(at, nextVersion),
    entity: "MANDATE_EVENT",
    mandateId: meta.mandateId,
    at,
    action: "cancel",
    fromStatus: meta.status,
    toStatus,
    reasonCode: cmd.reasonCode,
    reasonDescription: REASON_CODES[cmd.reasonCode],
    actor: cmd.actor,
    requestId: cmd.requestId,
  };

  const response: StoredResponse = {
    statusCode: 200,
    body: {
      mandate: toMandateDetailDto({
        ...meta,
        status: toStatus,
        version: nextVersion,
        updatedAt: at,
      }),
    },
  };

  const idempotency: IdempotencyItem = {
    PK: cancelIdempotencyPk(meta.mandateId, cmd.idempotencyKey),
    SK: SK.idempotencyLock,
    entity: "IDEMPOTENCY",
    response: JSON.stringify(response),
    ttl: Math.floor(cmd.now.getTime() / 1000) + IDEMPOTENCY_TTL_SECONDS,
  };

  return {
    kind: "plan",
    response,
    plan: {
      mandateKey: { PK: mandatePk(meta.mandateId), SK: SK.mandateMeta },
      summaryKey: {
        PK: customerPk(capId),
        SK: SK.customerMandate(meta.mandateId),
      },
      cancellableFrom: CANCELLABLE_FROM,
      expectedVersion: meta.version,
      nextVersion,
      toStatus,
      updatedAt: at,
      summaryGsi2: gsi2ForMandate(capId, toStatus, meta.mandateId),
      event,
      idempotency,
    },
  };
}

export const isCancellable = (status: MandateStatus): boolean => CANCELLABLE_FROM.includes(status);
