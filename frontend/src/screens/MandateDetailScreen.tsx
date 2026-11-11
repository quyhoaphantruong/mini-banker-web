import { TEST_IDS, allowedActions, type MandateId } from "@mbd/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useApi } from "../api/context";
import { Alert, Spinner } from "../components/feedback";
import { formatCents, formatMandateAmount, formatTimestamp } from "../format";
import { AgreementDetails } from "./AgreementDetails";
import { CancelModal } from "./CancelModal";

export function MandateDetailScreen({
  mandateId,
  onBack,
}: {
  mandateId: MandateId;
  onBack: () => void;
}) {
  const api = useApi();
  const [cancelOpen, setCancelOpen] = useState(false);
  const mandate = useQuery({
    queryKey: ["mandate", mandateId],
    queryFn: () => api.mandate(mandateId),
  });
  const events = useQuery({
    queryKey: ["mandate-events", mandateId],
    queryFn: () => api.mandateEvents(mandateId),
  });
  const txns = useQuery({
    queryKey: ["mandate-transactions", mandateId],
    queryFn: () => api.mandateTransactions(mandateId),
  });

  const back = (
    <button
      type="button"
      className="btn btn-link"
      data-testid={TEST_IDS.backToMandates}
      onClick={onBack}
    >
      Back to PayTo agreements
    </button>
  );

  if (mandate.isPending) return <Spinner label="Loading agreement" />;
  if (mandate.isError) {
    return (
      <>
        {back}
        <Alert testId={TEST_IDS.errorBanner}>
          Could not load this agreement. Please try again.
        </Alert>
      </>
    );
  }

  const m = mandate.data;
  const amendment = m.pendingAmendment;
  const canCancel = allowedActions(m.status).includes("cancel");

  return (
    <section aria-labelledby="mandate-title">
      {back}
      <header className="summary-band">
        <div>
          <h2 id="mandate-title">{m.initiator}</h2>
          <p>{m.shortDescription}</p>
        </div>
        <div className="summary-right">
          <span
            className={`badge badge-status badge-${m.status.toLowerCase()}`}
            data-testid={TEST_IDS.mandateStatus}
          >
            {m.status}
          </span>
          <p className="amount">
            {formatMandateAmount(m.amountCents, m.maxAmountCents)}
          </p>
        </div>
      </header>

      {amendment && (
        <Alert tone="warning" testId={TEST_IDS.mandateActionRequired}>
          <strong>Action required.</strong> {m.initiator} has proposed changes
          to this agreement. The customer must respond by{" "}
          {formatTimestamp(amendment.respondBy)}.
        </Alert>
      )}

      <AgreementDetails mandate={m} />

      <section aria-labelledby="linked-heading" className="card">
        <h3 id="linked-heading">Linked account</h3>
        <dl className="details">
          <div className="details-row">
            <dt>Payer</dt>
            <dd>{m.payerName}</dd>
          </div>
          <div className="details-row">
            <dt>BSB</dt>
            <dd>{m.bsb}</dd>
          </div>
          <div className="details-row">
            <dt>Account number</dt>
            <dd>{m.accountNo}</dd>
          </div>
          <div className="details-row">
            <dt>Ultimate payer</dt>
            <dd>{m.ultimatePayer ?? "Not set"}</dd>
          </div>
          <div className="details-row">
            <dt>Customer reference</dt>
            <dd>{m.paymentReference}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="history-heading" className="card">
        <h3 id="history-heading">Action history</h3>
        {events.isPending && <Spinner label="Loading history" />}
        {events.isError && <Alert>Could not load action history.</Alert>}
        {events.data && (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Action</th>
                <th scope="col">Status</th>
                <th scope="col">Reason code</th>
                <th scope="col">Reason description</th>
              </tr>
            </thead>
            <tbody>
              {[...events.data.events]
                .sort((a, b) => b.at.localeCompare(a.at))
                .map((e) => (
                  <tr
                    key={`${e.at}-${e.action}`}
                    data-testid={TEST_IDS.mandateEventRow}
                  >
                    <td>{formatTimestamp(e.at)}</td>
                    <td>{e.action}</td>
                    <td>{e.toStatus}</td>
                    <td>{e.reasonCode ?? "-"}</td>
                    <td>{e.reasonDescription ?? "-"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-labelledby="txn-heading" className="card">
        <h3 id="txn-heading">Recent transactions</h3>
        {txns.isPending && <Spinner label="Loading transactions" />}
        {txns.isError && <Alert>Could not load transactions.</Alert>}
        {txns.data &&
          (txns.data.transactions.length === 0 ? (
            <p>No transactions yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Description</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...txns.data.transactions]
                  .sort((a, b) => b.at.localeCompare(a.at))
                  .map((t) => (
                    <tr
                      key={`${t.at}-${t.description}`}
                      data-testid={TEST_IDS.mandateTxnRow}
                    >
                      <td>{formatTimestamp(t.at)}</td>
                      <td>{t.description}</td>
                      <td>{t.status}</td>
                      <td className="num">{formatCents(t.amountCents)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ))}
      </section>

      {canCancel && (
        <button
          type="button"
          className="btn btn-danger"
          data-testid={TEST_IDS.cancelMandateButton}
          onClick={() => setCancelOpen(true)}
        >
          Cancel agreement
        </button>
      )}
      {cancelOpen && (
        <CancelModal mandate={m} onClose={() => setCancelOpen(false)} />
      )}
    </section>
  );
}
