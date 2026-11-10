export const REASON_CODES = {
  MD16: 'Cancelled on customer request',
  AM12: 'Cancelled by bank system due to unspecified limit',
  AC02: 'Cancelled by bank system due to account unavailability',
  AC05: 'Cancelled by bank system due to account closure',
  AC13: 'Cancelled by bank system due to ineligible account'
} as const

export type ReasonCode = keyof typeof REASON_CODES

export function reasonDescription(code: ReasonCode): string {
  return REASON_CODES[code]
}