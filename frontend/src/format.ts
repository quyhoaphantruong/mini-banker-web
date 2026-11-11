import type { AmountType, Frequency, IsoDate, IsoTimestamp } from "@mbd/shared";

const money = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
});

/** The only place cents become dollars. */
export const formatCents = (cents: number): string => money.format(cents / 100);

const dateTime = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Australia/Sydney",
});

const dateOnly = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export const formatTimestamp = (iso: IsoTimestamp): string =>
  dateTime.format(new Date(iso));
export const formatDate = (iso: IsoDate): string =>
  dateOnly.format(new Date(`${iso}T00:00:00Z`));

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  SEMI_ANNUALLY: "Every six months",
  ANNUALLY: "Annually",
  ADHOC: "Ad hoc",
};

export const AMOUNT_TYPE_SENTENCE: Record<AmountType, string> = {
  FIXE: "Payment amount is fixed",
  VARI: "Payment amount is variable",
  USGB: "Payment amount is based on usage",
  BALN: "Payment amount is fixed with balloon payment",
};

/** "Up to $X" when a ceiling is set, else the fixed amount. */
export function formatMandateAmount(
  amountCents: number | null,
  maxAmountCents: number | null,
): string {
  if (maxAmountCents !== null) return `Up to ${formatCents(maxAmountCents)}`;
  if (amountCents !== null) return formatCents(amountCents);
  return "Amount not specified";
}
