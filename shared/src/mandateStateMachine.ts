import type { MandateStatus } from "./types.js";

export const MANDATE_ACTIONS = [
  "accept",
  "decline",
  "pause",
  "resume",
  "cancel",
  "amend",
  "approveAmendment",
  "rejectAmendment",
  "expireAmendment",
] as const;
export type MandateAction = (typeof MANDATE_ACTIONS)[number];

type Transitions = Readonly<
  Record<MandateStatus, Partial<Record<MandateAction, MandateStatus>>>
>;

const TRANSITIONS: Transitions = {
  CREATED: { accept: "ACTIVE", decline: "CANCELLED" },
  ACTIVE: {
    pause: "PAUSED",
    cancel: "CANCELLED",
    amend: "ACTIVE",
    approveAmendment: "ACTIVE",
    rejectAmendment: "ACTIVE",
    expireAmendment: "ACTIVE",
  },
  PAUSED: { resume: "ACTIVE", cancel: "CANCELLED" },
  CANCELLED: {},
};

/** Returns the next status, or null when the action is not allowed from 'from'. */
export function nextStatus(
  from: MandateStatus,
  action: MandateAction,
): MandateStatus | null {
  return TRANSITIONS[from][action] ?? null;
}

export function allowedActions(from: MandateStatus): MandateAction[] {
  return Object.keys(TRANSITIONS[from]) as MandateAction[];
}

/** Statuses from which 'cancel' is valid. Used in DynamoDB ConditionExpressions. */
export const CANCELLABLE_FROM: readonly MandateStatus[] = (
  Object.keys(TRANSITIONS) as MandateStatus[]
).filter((s) => TRANSITIONS[s].cancel !== undefined);