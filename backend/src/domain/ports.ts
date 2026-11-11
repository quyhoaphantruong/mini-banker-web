import type { MandateId, MandateMetaItem } from "@mbd/shared";
import type { CancelPlan, StoredResponse } from "./mandate";

export type CommitOutcome = { kind: 'commited' } | { kind: 'rejected'; metaRejected: boolean}

export interface CancelRepository {
    getStoredCancel(mandateId: MandateId, key: string): Promise<StoredResponse | null>
    getMandate(mandateId: MandateId): Promise<MandateMetaItem | null>
    commitCancel(plan: CancelPlan): Promise<CommitOutcome>
}
