import type { ReactNode } from "react";

export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="spinner-row">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

/** role=alert makes screen readers announce it when it appears. */
export function Alert({
  tone = "error",
  testId,
  children,
}: {
  tone?: "error" | "warning";
  testId?: string;
  children: ReactNode;
}) {
  return (
    <div role="alert" className={`alert alert-${tone}`} data-testid={testId}>
      {children}
    </div>
  );
}
