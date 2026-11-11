import {
  TEST_IDS,
  type CapId,
  type MandateId,
  type MandateStatus,
  type MandateSummaryDto,
} from "@mbd/shared";
import { useQuery } from "@tanstack/react-query";
import { useApi } from "../api/context";
import { Alert, Spinner } from "../components/feedback";
import { Tabs, type TabItem } from "../components/Tabs";
import {
  AMOUNT_TYPE_SENTENCE,
  FREQUENCY_LABEL,
  formatMandateAmount,
} from "../format";

const STATUS_TABS: readonly TabItem<MandateStatus>[] = [
  { id: "ACTIVE", label: "Active", testId: TEST_IDS.mandatesTabActive },
  { id: "CREATED", label: "Created", testId: TEST_IDS.mandatesTabCreated },
  { id: "PAUSED", label: "Paused", testId: TEST_IDS.mandatesTabPaused },
  {
    id: "CANCELLED",
    label: "Cancelled",
    testId: TEST_IDS.mandatesTabCancelled,
  },
];

interface Props {
  capId: CapId;
  status: MandateStatus;
  onStatusChange: (s: MandateStatus) => void;
  onOpenMandate: (id: MandateId) => void;
}

export function MandatesPanel({
  capId,
  status,
  onStatusChange,
  onOpenMandate,
}: Props) {
  return (
    <Tabs
      label="Agreement status"
      items={STATUS_TABS}
      selected={status}
      onSelect={onStatusChange}
      idPrefix="mandates"
      variant="secondary"
    >
      <MandateList
        capId={capId}
        status={status}
        onOpenMandate={onOpenMandate}
      />
    </Tabs>
  );
}

function MandateList({
  capId,
  status,
  onOpenMandate,
}: {
  capId: CapId;
  status: MandateStatus;
  onOpenMandate: (id: MandateId) => void;
}) {
  const api = useApi();
  const mandates = useQuery({
    queryKey: ["mandates", capId, status],
    queryFn: () => api.mandates(capId, status),
  });

  if (mandates.isPending) return <Spinner label="Loading agreements" />;
  if (mandates.isError) {
    return (
      <Alert>
        Could not load PayTo agreements.{" "}
        <button
          type="button"
          className="link"
          onClick={() => void mandates.refetch()}
        >
          Try again
        </button>
      </Alert>
    );
  }

  if (mandates.data.mandates.length === 0) {
    return (
      <p data-testid={TEST_IDS.mandatesEmpty}>
        There are no {status.toLowerCase()} PayTo agreements for this customer.
      </p>
    );
  }

  return (
    <ul className="card-list">
      {mandates.data.mandates.map((m) => (
        <li key={m.mandateId}>
          <MandateCard
            mandate={m}
            onViewDetails={() => onOpenMandate(m.mandateId)}
          />
        </li>
      ))}
    </ul>
  );
}

function MandateCard({
  mandate: m,
  onViewDetails,
}: {
  mandate: MandateSummaryDto;
  onViewDetails: () => void;
}) {
  return (
    <article className="card mandate-card" data-testid={TEST_IDS.mandateCard}>
      <h3>{m.initiator}</h3>
      <p>{m.shortDescription}</p>
      <p className="amount">
        {formatMandateAmount(m.amountCents, m.maxAmountCents)}
      </p>
      <p className="muted">{FREQUENCY_LABEL[m.frequency]}</p>
      <p className="muted">{AMOUNT_TYPE_SENTENCE[m.amountType]}</p>
      <button
        type="button"
        className="btn"
        data-testid={TEST_IDS.mandateViewDetails}
        aria-label={`View details of ${m.initiator} agreement`}
        onClick={onViewDetails}
      >
        View details
      </button>
    </article>
  );
}
