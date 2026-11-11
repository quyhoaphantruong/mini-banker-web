import type { CapId } from '@mbd/shared'

export interface AuditLine {
    event: 'customer.profile.read'
    at: string
    actor: string
    capId: CapId
    route: string
    requestId: string
    traceId: string | null
}

export const buildAuditLine = (input: Omit<AuditLine, 'event' | 'at'>, now: Date): AuditLine => ({
    event: 'customer.profile.read',
    at: now.toISOString(),
    ...input,
})
