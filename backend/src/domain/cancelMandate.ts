import type { MandateId } from "@mbd/shared";
import {
  isCancellable,
  planCancel,
  type CancelCommand,
  type StoredResponse,
} from "./mandate.js";
import type { CancelRepository } from "./ports.js";

export type CancelResult =
  | { kind: "cancelled"; response: StoredResponse }
  | { kind: "replayed"; response: StoredResponse }
  | { kind: "not-found"; mandateId: MandateId }
  | { kind: "invalid-transition" }
  | { kind: "version-conflict" };

export async function cancelMandate(
  repo: CancelRepository,
  cmd: CancelCommand,
): Promise<CancelResult> {
  const stored = await repo.getStoredCancel(cmd.mandateId, cmd.idempotencyKey);
  if (stored) return { kind: "replayed", response: stored };

  const meta = await repo.getMandate(cmd.mandateId);
  if (!meta) return { kind: "not-found", mandateId: cmd.mandateId };

  const planned = planCancel(meta, cmd);
  if (planned.kind === "invalid-transition") return { kind: "invalid-transition" };

  const outcome = await repo.commitCancel(planned.plan);
  if (outcome.kind === "committed") return { kind: "cancelled", response: planned.response };

  const winner = await repo.getStoredCancel(cmd.mandateId, cmd.idempotencyKey);
  if (winner) return { kind: "replayed", response: winner };

  const current = await repo.getMandate(cmd.mandateId);
  if (!current) return { kind: "not-found", mandateId: cmd.mandateId };
  if (!isCancellable(current.status)) return { kind: "invalid-transition" };
  if (outcome.metaRejected) return { kind: "version-conflict" };
  throw new Error(`Customer mandate summary for ${cmd.mandateId} drifted from META`);
}
