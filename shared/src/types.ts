export type Brand<T, B extends string> = T & { readonly __brand: B };

export type Crn = Brand<string, "Crn">;
export type CapId = Brand<string, "CapId">;
export type AccountNo = Brand<string, "AccountNo">;
export type MandateId = Brand<string, "MandateId">;

export const MANDATE_STATUSES = ["CREATED", "ACTIVE", "PAUSED", "CANCELLED"] as const;
export type MandateStatus = (typeof MANDATE_STATUSES)[number];

export const AMOUNT_TYPES = ["FIXE", "VARI", "USGB", "BALN"] as const;
export type AmountType = (typeof AMOUNT_TYPES)[number];

export const FREQUENCIES = ["WEEKLY", "MONTHLY","QUARTERLY", "SEMI_ANNUALLY", "ANNUALLY","ADHOC"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export type CustomerType = "Individual" | "Business";
export type KycStatus = "Complete" | "Incomplete" | "Unknown";
export type VerificationStatus = "Verified" | "Unverified" | "Unknown";
export type AccountStatus = "OPEN" | "CLOSED";
export type TxnStatus = "POSTED" | "PENDING" | "FAILED";

/** ISO-8601 UTC, for example 2026-11-08T01:02:03.456Z */
export type IsoTimestamp = string;
/** ISO-8601 calendar date, for example 2026-11-08 */
export type IsoDate = string;

export interface Address {
  line1: string;
  suburb: string;
  state: string;
  postcode: string;
  country: string;
}

/** Fields a payment initiator may propose to change on an ACTIVE mandate. */
export interface PendingAmendment {
  proposedAt: IsoTimestamp;
  respondBy: IsoTimestamp;
  changes: Partial<{
    maxAmountCents: number;
    amountCents: number;
    shortDescription: string;
    conditionsOfPayment: string;
    firstPaymentAmountCents: number;
    firstPaymentDate: IsoDate;
    lastPaymentAmountCents: number;
    lastPaymentDate: IsoDate;
    endDate: IsoDate;
  }>;
}
