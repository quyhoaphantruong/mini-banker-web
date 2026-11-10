import type {
  AccountNo,
  AccountStatus,
  Address,
  AmountType,
  CapId,
  Crn,
  CustomerType,
  Frequency,
  IsoDate,
  IsoTimestamp,
  KycStatus,
  MandateId,
  MandateStatus,
  PendingAmendment,
  TxnStatus,
  VerificationStatus,
} from "./types.js";
import type { MandateAction } from "./mandateStateMachine.js";
import type { ReasonCode } from "./reasonCodes.js";

interface Keyed {
  PK: string;
  SK: string;
}

export interface CrnMapItem extends Keyed {
  entity: "CRN_MAP";
  capId: CapId;
}

export interface CustomerProfileItem extends Keyed {
  entity: "PROFILE";
  capId: CapId;
  crn: Crn;
  fullName: string;
  customerType: CustomerType;
  kycStatus: KycStatus;
  verificationStatus: VerificationStatus;
  dob?: IsoDate;
  address: Address;
}

export interface AccountItem extends Keyed {
  entity: "ACCOUNT";
  capId: CapId;
  accountNo: AccountNo;
  bsb: string;
  description: string;
  status: AccountStatus;
  balanceCents: number;
  GSI1PK: string;
  GSI1SK: string;
}

/** Summary copy under the customer partition. Updated in the same transaction as MandateMetaItem. */
export interface CustomerMandateItem extends Keyed {
  entity: "CUSTOMER_MANDATE";
  capId: CapId;
  mandateId: MandateId;
  initiator: string;
  shortDescription: string;
  maxAmountCents: number | null;
  amountCents: number | null;
  frequency: Frequency;
  amountType: AmountType;
  status: MandateStatus;
  hasPendingAmendment: boolean;
  GSI2PK: string;
  GSI2SK: string;
}

export interface MandateMetaItem extends Keyed {
  entity: "MANDATE_META";
  mandateId: MandateId;
  capId: CapId;
  initiator: string;
  description: string;
  shortDescription: string;
  purpose: string;
  paymentReference: string;
  conditionsOfPayment: string | null;
  amountCents: number | null;
  maxAmountCents: number | null;
  firstPaymentAmountCents: number | null;
  firstPaymentDate: IsoDate | null;
  lastPaymentAmountCents: number | null;
  lastPaymentDate: IsoDate | null;
  frequency: Frequency;
  amountType: AmountType;
  startDate: IsoDate;
  endDate: IsoDate | null;
  autoRenew: boolean;
  migratedFromDirectDebit: boolean;
  payerName: string;
  ultimatePayer: string | null;
  accountNo: AccountNo;
  bsb: string;
  status: MandateStatus;
  /** Optimistic lock. Incremented by every write. */
  version: number;
  pendingAmendment: PendingAmendment | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface MandateEventItem extends Keyed {
  entity: "MANDATE_EVENT";
  mandateId: MandateId;
  at: IsoTimestamp;
  action: MandateAction;
  fromStatus: MandateStatus;
  toStatus: MandateStatus;
  reasonCode: ReasonCode | null;
  reasonDescription: string | null;
  actor: string;
  requestId: string;
}

export interface MandateTxnItem extends Keyed {
  entity: "MANDATE_TXN";
  mandateId: MandateId;
  at: IsoTimestamp;
  description: string;
  amountCents: number;
  status: TxnStatus;
}

export interface IdempotencyItem extends Keyed {
  entity: "IDEMPOTENCY";
  /** JSON of the original HTTP response: { statusCode, body }. */
  response: string;
  /** Epoch seconds. DynamoDB TTL attribute. */
  ttl: number;
}

export type TableItem =
  | CrnMapItem
  | CustomerProfileItem
  | AccountItem
  | CustomerMandateItem
  | MandateMetaItem
  | MandateEventItem
  | MandateTxnItem
  | IdempotencyItem;