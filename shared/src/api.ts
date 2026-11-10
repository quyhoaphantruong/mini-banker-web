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

/** Money is always integer cents on the wire. The UI formats it. */
export const ROUTES = {
  launch: "/api/launch",
  search: "/api/customers/search",
  customer: "/api/customers/:capId",
  accounts: "/api/customers/:capId/accounts",
  mandates: "/api/customers/:capId/mandates",
  mandate: "/api/mandates/:id",
  mandateEvents: "/api/mandates/:id/events",
  mandateTransactions: "/api/mandates/:id/transactions",
  mandateCancel: "/api/mandates/:id/cancel",
} as const;

export const BANKER_GROUP = "banker";
export const IDEMPOTENCY_HEADER = "Idempotency-Key";

export interface ErrorBody {
  code: ErrorCode;
  message: string;
  requestId: string;
}

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_REQUEST"
  | "INVALID_TRANSITION"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "VERSION_CONFLICT"
  | "THROTTLED"
  | "INTERNAL";

export interface LaunchResponse {
  username: string;
  groups: string[];
}

export interface SearchRequest {
  crn: string;
}

/** Same shape as the BDS BFF `customers/search` response. The UI reads capids[0]. */
export interface SearchResponse {
  crn: Crn;
  capIds: CapId[];
}

export interface CustomerDto {
  capId: CapId;
  crn: Crn;
  fullName: string;
  customerType: CustomerType;
  kycStatus: KycStatus;
  verificationStatus: VerificationStatus;
  dob: IsoDate | null;
  address: Address;
}

export interface AccountDto {
  accountNo: AccountNo;
  bsb: string;
  description: string;
  status: AccountStatus;
  balanceCents: number;
}

export interface AccountsResponse {
  accounts: AccountDto[];
}

export interface MandateSummaryDto {
  mandateId: MandateId;
  initiator: string;
  shortDescription: string;
  maxAmountCents: number | null;
  amountCents: number | null;
  frequency: Frequency;
  amountType: AmountType;
  status: MandateStatus;
  hasPendingAmendment: boolean;
}

export interface MandatesResponse {
  mandates: MandateSummaryDto[];
}

export interface MandateDetailDto {
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
  version: number;
  pendingAmendment: PendingAmendment | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface MandateEventDto {
  at: IsoTimestamp;
  action: MandateAction;
  fromStatus: MandateStatus;
  toStatus: MandateStatus;
  reasonCode: string | null;
  reasonDescription: string | null;
  actor: string;
}

export interface MandateEventsResponse {
  events: MandateEventDto[];
}

export interface MandateTransactionDto {
  at: IsoTimestamp;
  description: string;
  amountCents: number;
  status: TxnStatus;
}

export interface MandateTransactionsResponse {
  transactions: MandateTransactionDto[];
}

export interface CancelMandateRequest {
  /** Optional. Defaults to MD16 (customer request). */
  reasonCode?: "MD16";
}

export interface CancelMandateResponse {
  mandate: MandateDetailDto;
}