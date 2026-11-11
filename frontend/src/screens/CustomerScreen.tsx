import {
  TEST_IDS,
  type CapId,
  type MandateId,
  type MandateStatus,
} from "@mbd/shared";
import { useQuery } from "@tanstack/react-query";
import { useApi } from "../api/context";
import { Alert, Spinner } from "../components/feedback";
import { Tabs, type TabItem } from "../components/Tabs";
import { formatCents, formatDate } from "../format";
import { MandatesPanel } from "./MandatesPanel";

export type CustomerTab = "profile" | "accounts" | "settings";

const TABS: readonly TabItem<CustomerTab>[] = [
  { id: "profile", label: "Profile", testId: TEST_IDS.tabProfile },
  { id: "accounts", label: "Accounts", testId: TEST_IDS.tabAccounts },
  {
    id: "settings",
    label: "Customer settings",
    testId: TEST_IDS.tabCustomerSettings,
  },
];

interface Props {
  capId: CapId;
  tab: CustomerTab;
  status: MandateStatus;
  onTabChange: (tab: CustomerTab) => void;
  onStatusChange: (status: MandateStatus) => void;
  onOpenMandate: (id: MandateId) => void;
}

export function CustomerScreen({
  capId,
  tab,
  status,
  onTabChange,
  onStatusChange,
  onOpenMandate,
}: Props) {
  const api = useApi();
  const customer = useQuery({
    queryKey: ["customer", capId],
    queryFn: () => api.customer(capId),
  });

  if (customer.isPending) return <Spinner label="Loading customer" />;
  if (customer.isError)
    return (
      <Alert testId={TEST_IDS.errorBanner}>
        Could not load the customer. Please try again.
      </Alert>
    );
  const c = customer.data;

  return (
    <section aria-labelledby="customer-name">
      <header className="customer-header">
        <h2 id="customer-name" data-testid={TEST_IDS.customerName}>
          {c.fullName}
        </h2>
        <span className="badge" data-testid={TEST_IDS.customerTypeBadge}>
          {c.customerType}
        </span>
        <span className="muted">CRN {c.crn}</span>
      </header>
      <Tabs
        label="Customer"
        items={TABS}
        selected={tab}
        onSelect={onTabChange}
        idPrefix="customer"
      >
        {tab === "profile" && (
          <dl className="details">
            <dt>Full name</dt>
            <dd>{c.fullName}</dd>
            <dt>Customer type</dt>
            <dd>{c.customerType}</dd>
            <dt>KYC status</dt>
            <dd>{c.kycStatus}</dd>
            <dt>Verification status</dt>
            <dd>{c.verificationStatus}</dd>
            <dt>Date of birth</dt>
            <dd>{c.dob ? formatDate(c.dob) : "Not recorded"}</dd>
            <dt>Address</dt>
            <dd>
              {c.address.line1}, {c.address.suburb} {c.address.state}{" "}
              {c.address.postcode}, {c.address.country}
            </dd>
          </dl>
        )}
        {tab === "accounts" && <AccountsList capId={capId} />}
        {tab === "settings" && (
          <SettingsTab
            capId={capId}
            status={status}
            onStatusChange={onStatusChange}
            onOpenMandate={onOpenMandate}
          />
        )}
      </Tabs>
    </section>
  );
}

function AccountsList({ capId }: { capId: CapId }) {
  const api = useApi();
  const accounts = useQuery({
    queryKey: ["accounts", capId],
    queryFn: () => api.accounts(capId),
  });

  if (accounts.isPending) return <Spinner label="Loading accounts" />;
  if (accounts.isError)
    return <Alert>Could not load accounts. Please try again.</Alert>;
  if (accounts.data.accounts.length === 0)
    return <p>This customer has no accounts.</p>;

  return (
    <table className="table">
      <caption className="sr-only">Accounts</caption>
      <thead>
        <tr>
          <th scope="col">Account</th>
          <th scope="col">BSB</th>
          <th scope="col">Account number</th>
          <th scope="col">Status</th>
          <th scope="col" className="num">
            Balance
          </th>
        </tr>
      </thead>
      <tbody>
        {accounts.data.accounts.map((a) => (
          <tr key={a.accountNo} data-testid={TEST_IDS.accountRow}>
            <td>{a.description}</td>
            <td>{a.bsb}</td>
            <td>{a.accountNo}</td>
            <td>{a.status}</td>
            <td className="num">{formatCents(a.balanceCents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type SettingsSubTab = "payto";
const SETTINGS_TABS: readonly TabItem<SettingsSubTab>[] = [
  { id: "payto", label: "PayTo agreements", testId: TEST_IDS.settingsTabPayTo },
];

function SettingsTab({
  capId,
  status,
  onStatusChange,
  onOpenMandate,
}: {
  capId: CapId;
  status: MandateStatus;
  onStatusChange: (s: MandateStatus) => void;
  onOpenMandate: (id: MandateId) => void;
}) {
  return (
    <Tabs
      label="Customer settings"
      items={SETTINGS_TABS}
      selected="payto"
      onSelect={() => undefined}
      idPrefix="settings"
      variant="secondary"
    >
      <MandatesPanel
        capId={capId}
        status={status}
        onStatusChange={onStatusChange}
        onOpenMandate={onOpenMandate}
      />
    </Tabs>
  );
}
