import type { CapId, Crn } from "./types";

export const FIXTURE_CUSTOMERS = {
  individual: { crn: "100000001", capId: "7000000001" as CapId },
  business: { crn: "100000002", capId: "7000000002" as CapId },
  noAccounts: { crn: "100000003", capId: "7000000003" as CapId },
} as const;

export const CRN_NOT_FOUND = "100000004";

export const CRN_SIMULATED_500 = "100000500";