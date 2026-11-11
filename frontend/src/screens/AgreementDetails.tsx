import {
  TEST_IDS,
  type MandateDetailDto,
  type PendingAmendment,
} from "@mbd/shared";
import type { ReactNode } from "react";
import {
  AMOUNT_TYPE_SENTENCE,
  FREQUENCY_LABEL,
  formatCents,
  formatDate,
} from "../format";

type Changes = PendingAmendment["changes"];

interface Row {
  label: string;
  current: string;
  /** Present only when an amendment proposes a different value for this field. */
  proposed?: string;
}

const NONE = "Not set";

const text = (label: string, current: string | null): Row => ({
  label,
  current: current ?? NONE,
});

type MoneyKey =
  | "maxAmountCents"
  | "amountCents"
  | "firstPaymentAmountCents"
  | "lastPaymentAmountCents";
type DateKey = "firstPaymentDate" | "lastPaymentDate" | "endDate";
type TextKey = "shortDescription" | "conditionsOfPayment";

function amendable(d: MandateDetailDto, c: Changes) {
  const money = (label: string, key: MoneyKey): Row => {
    const cur = d[key];
    const next = c[key];
    return {
      label,
      current: cur === null ? NONE : formatCents(cur),
      ...(next !== undefined ? { proposed: formatCents(next) } : {}),
    };
  };
  const date = (label: string, key: DateKey): Row => {
    const cur = d[key];
    const next = c[key];
    return {
      label,
      current: cur === null ? NONE : formatDate(cur),
      ...(next !== undefined ? { proposed: formatDate(next) } : {}),
    };
  };
  const str = (label: string, key: TextKey): Row => {
    const next = c[key];
    return {
      label,
      current: d[key] ?? NONE,
      ...(next !== undefined ? { proposed: next } : {}),
    };
  };
  return { money, date, str };
}

function buildRows(d: MandateDetailDto): Row[] {
  const { money, date, str } = amendable(d, d.pendingAmendment?.changes ?? {});
  return [
    text("Initiator", d.initiator),
    str("Short description", "shortDescription"),
    text("Description", d.description),
    text("Purpose", d.purpose),
    text("Payment reference", d.paymentReference),
    text("Frequency", FREQUENCY_LABEL[d.frequency]),
    text("Amount type", AMOUNT_TYPE_SENTENCE[d.amountType]),
    money("Payment amount", "amountCents"),
    money("Maximum amount", "maxAmountCents"),
    money("First payment amount", "firstPaymentAmountCents"),
    date("First payment date", "firstPaymentDate"),
    money("Last payment amount", "lastPaymentAmountCents"),
    date("Last payment date", "lastPaymentDate"),
    text("Start date", formatDate(d.startDate)),
    text("Auto renew", d.autoRenew ? "Yes" : "No"),
    str("Conditions of payment", "conditionsOfPayment"),
  ];
}

function Value({ row }: { row: Row }): ReactNode {
  if (row.proposed === undefined) return row.current;
  return (
    <>
      <del>
        <span className="sr-only">Previous value </span>
        {row.current}
      </del>{" "}
      <span
        className="badge badge-updated"
        data-testid={TEST_IDS.mandateUpdatedBadge}
      >
        Updated
      </span>{" "}
      <ins>
        <span className="sr-only">Proposed value </span>
        {row.proposed}
      </ins>
    </>
  );
}

export function AgreementDetails({ mandate }: { mandate: MandateDetailDto }) {
  return (
    <section aria-labelledby="agreement-heading" className="card">
      <h3 id="agreement-heading">
        Agreement details{" "}
        {mandate.migratedFromDirectDebit && (
          <span className="badge">Migrated from direct debit</span>
        )}
      </h3>
      <dl className="details">
        {buildRows(mandate).map((row) => (
          <div key={row.label} className="details-row">
            <dt>{row.label}</dt>
            <dd>
              <Value row={row} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
