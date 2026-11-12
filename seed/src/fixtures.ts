import {
  FIXTURE_CUSTOMERS,
  SK,
  crnPk,
  customerPk,
  gsi1ForAccount,
  gsi2ForMandate,
  mandatePk,
  reasonDescription,
  type AccountItem,
  type AccountNo,
  type AmountType,
  type CapId,
  type CrnMapItem,
  type CustomerMandateItem,
  type CustomerProfileItem,
  type Frequency,
  type IsoDate,
  type IsoTimestamp,
  type MandateAction,
  type MandateEventItem,
  type MandateId,
  type MandateMetaItem,
  type MandateStatus,
  type MandateTxnItem,
  type PendingAmendment,
  type ReasonCode,
  type TableItem,
  type TxnStatus
} from '@mbd/shared'

export const FIXTURE_NOW: IsoTimestamp = '2026-11-08T00:00:00.000Z'

export const MANDATE_IDS = {
  activeFixed: '01931b5e-7a00-7000-8000-000000000001' as MandateId,
  activeVariable: '01931b5e-7a00-7000-8000-000000000002' as MandateId,
  activeUsage: '01931b5e-7a00-7000-8000-000000000003' as MandateId,
  activeBalance: '01931b5e-7a00-7000-8000-000000000004' as MandateId,
  paused: '01931b5e-7a00-7000-8000-000000000005' as MandateId,
  cancelled: '01931b5e-7a00-7000-8000-000000000006' as MandateId,
  created: '01931b5e-7a00-7000-8000-000000000007' as MandateId
} as const

export const ACCOUNT_NOS = {
  everyday: '123456781' as AccountNo,
  savings: '123456782' as AccountNo,
  business: '223456781' as AccountNo
} as const

const BSB = '013-102'
const INDIVIDUAL = FIXTURE_CUSTOMERS.individual
const PAYER = 'Alex Testperson'

// ---- customers ----
const customers: CustomerProfileItem[] = [
  {
    PK: customerPk(INDIVIDUAL.capId),
    SK: SK.profile,
    entity: 'PROFILE',
    capId: INDIVIDUAL.capId,
    crn: INDIVIDUAL.crn as CustomerProfileItem['crn'],
    fullName: PAYER,
    customerType: 'Individual',
    kycStatus: 'Complete',
    verificationStatus: 'Verified',
    dob: '1985-04-12',
    address: { line1: '1 Example Street', suburb: 'Sampleville', state: 'VIC', postcode: '3000', country: 'AU' }
  },
  {
    PK: customerPk(FIXTURE_CUSTOMERS.business.capId),
    SK: SK.profile,
    entity: 'PROFILE',
    capId: FIXTURE_CUSTOMERS.business.capId,
    crn: FIXTURE_CUSTOMERS.business.crn as CustomerProfileItem['crn'],
    fullName: 'Fakeco Trading Pty Ltd',
    customerType: 'Business',
    kycStatus: 'Complete',
    verificationStatus: 'Verified',
    address: { line1: '22 Demo Road', suburb: 'Mockton', state: 'NSW', postcode: '2000', country: 'AU' }
  },
  {
    PK: customerPk(FIXTURE_CUSTOMERS.noAccounts.capId),
    SK: SK.profile,
    entity: 'PROFILE',
    capId: FIXTURE_CUSTOMERS.noAccounts.capId,
    crn: FIXTURE_CUSTOMERS.noAccounts.crn as CustomerProfileItem['crn'],
    fullName: 'Sam Noaccounts',
    customerType: 'Individual',
    kycStatus: 'Incomplete',
    verificationStatus: 'Unverified',
    dob: '1992-09-30',
    address: { line1: '3 Placeholder Lane', suburb: 'Dummytown', state: 'QLD', postcode: '4000', country: 'AU' }
  }
]

const crnMaps: CrnMapItem[] = customers.map((c) => ({
  PK: crnPk(c.crn),
  SK: SK.crnMap,
  entity: 'CRN_MAP',
  capId: c.capId
}))

// ---- accounts ----
function account(capId: CapId, accountNo: AccountNo, description: string, balanceCents: number): AccountItem {
  return {
    PK: customerPk(capId),
    SK: SK.account(accountNo),
    entity: 'ACCOUNT',
    capId,
    accountNo,
    bsb: BSB,
    description,
    status: 'OPEN',
    balanceCents,
    ...gsi1ForAccount(accountNo, capId)
  }
}

const accounts: AccountItem[] = [
  account(INDIVIDUAL.capId, ACCOUNT_NOS.everyday, 'Everyday Account', 245075),
  account(INDIVIDUAL.capId, ACCOUNT_NOS.savings, 'Online Saver', 1250000),
  account(FIXTURE_CUSTOMERS.business.capId, ACCOUNT_NOS.business, 'Business Transaction Account', 8912340)
]

// ---- mandates ----
interface PaymentSpec {
  amountCents: number
  date: IsoDate
}

interface MandateSpec {
  id: MandateId
  status: MandateStatus
  initiator: string
  shortDescription: string
  description: string
  purpose: string
  amountType: AmountType
  frequency: Frequency
  amountCents: number | null
  maxAmountCents: number | null
  conditionsOfPayment: string | null
  firstPayment: PaymentSpec | null
  lastPayment: PaymentSpec | null
  startDate: IsoDate
  endDate: IsoDate | null
  autoRenew: boolean
  migratedFromDirectDebit: boolean
  pendingAmendment: PendingAmendment | null
  accountNo: AccountNo
  createdAt: IsoTimestamp
  updatedAt: IsoTimestamp
  version: number
}

// respondBy is later than FIXTURE_NOW.
const AMENDMENT: PendingAmendment = {
  proposedAt: '2026-11-05T02:00:00.000Z',
  respondBy: '2026-12-08T00:00:00.000Z',
  changes: {
    amountCents: 6_500,
    maxAmountCents: 9_000,
    shortDescription: 'Gym membership (premium)',
    conditionsOfPayment: 'Premium tier billed monthly, cancel with 14 days notice.',
    firstPaymentAmountCents: 6_500,
    firstPaymentDate: '2026-12-15',
    lastPaymentAmountCents: 6_500,
    lastPaymentDate: '2027-11-15',
    endDate: '2027-11-30'
  }
}

const specs: MandateSpec[] = [
  {
    id: MANDATE_IDS.activeFixed,
    status: 'ACTIVE',
    initiator: 'Sampleco Energy',
    shortDescription: 'Electricity bill',
    description: 'Fixed monthly electricity payment to Sampleco Energy',
    purpose: 'Utilities',
    amountType: 'FIXE',
    frequency: 'MONTHLY',
    amountCents: 18000,
    maxAmountCents: 18000,
    conditionsOfPayment: null,
    firstPayment: null,
    lastPayment: null,
    startDate: '2026-01-15',
    endDate: null,
    autoRenew: true,
    migratedFromDirectDebit: true,
    pendingAmendment: AMENDMENT,
    accountNo: ACCOUNT_NOS.everyday,
    createdAt: '2026-01-10T01:00:00.000Z',
    updatedAt: '2026-01-12T01:00:00.000Z',
    version: 2
  },
  {
    id: MANDATE_IDS.activeVariable,
    status: 'ACTIVE',
    initiator: 'Demo Telecom',
    shortDescription: 'Mobile plan',
    description: 'Variable monthly mobile plan charges to Demo Telecom',
    purpose: 'Telecommunications',
    amountType: 'VARI',
    frequency: 'MONTHLY',
    amountCents: null,
    maxAmountCents: 15000,
    conditionsOfPayment: 'Charged after each billing cycle.',
    firstPayment: null,
    lastPayment: null,
    startDate: '2026-02-01',
    endDate: null,
    autoRenew: true,
    migratedFromDirectDebit: false,
    pendingAmendment: null,
    accountNo: ACCOUNT_NOS.everyday,
    createdAt: '2026-01-25T01:00:00.000Z',
    updatedAt: '2026-01-26T01:00:00.000Z',
    version: 2
  },
  {
    id: MANDATE_IDS.activeUsage,
    status: 'ACTIVE',
    initiator: 'Pretend Water Authority',
    shortDescription: 'Water usage',
    description: 'Usage-based quarterly water charges',
    purpose: 'Utilities',
    amountType: 'USGB',
    frequency: 'QUARTERLY',
    amountCents: null,
    maxAmountCents: 40000,
    conditionsOfPayment: null,
    firstPayment: null,
    lastPayment: null,
    startDate: '2026-03-01',
    endDate: '2028-03-01',
    autoRenew: false,
    migratedFromDirectDebit: false,
    pendingAmendment: null,
    accountNo: ACCOUNT_NOS.savings,
    createdAt: '2026-02-20T01:00:00.000Z',
    updatedAt: '2026-02-21T01:00:00.000Z',
    version: 2
  },
  {
    id: MANDATE_IDS.activeBalance,
    status: 'ACTIVE',
    initiator: 'Make-Believe Credit Cards',
    shortDescription: 'Card repayment',
    description: 'Pay the outstanding card balance each month',
    purpose: 'Loan repayment',
    amountType: 'BALN',
    frequency: 'MONTHLY',
    amountCents: null,
    maxAmountCents: 300000,
    conditionsOfPayment: 'Statement balance, capped at the maximum amount.',
    firstPayment: null,
    lastPayment: null,
    startDate: '2026-04-05',
    endDate: null,
    autoRenew: true,
    migratedFromDirectDebit: false,
    pendingAmendment: null,
    accountNo: ACCOUNT_NOS.everyday,
    createdAt: '2026-03-30T01:00:00.000Z',
    updatedAt: '2026-03-31T01:00:00.000Z',
    version: 2
  },
  {
    id: MANDATE_IDS.paused,
    status: 'PAUSED',
    initiator: 'Fictional Streaming Co',
    shortDescription: 'Streaming subscription',
    description: 'Monthly streaming subscription',
    purpose: 'Entertainment',
    amountType: 'FIXE',
    frequency: 'MONTHLY',
    amountCents: 1699,
    maxAmountCents: 1699,
    conditionsOfPayment: null,
    firstPayment: null,
    lastPayment: null,
    startDate: '2026-05-01',
    endDate: null,
    autoRenew: true,
    migratedFromDirectDebit: false,
    pendingAmendment: null,
    accountNo: ACCOUNT_NOS.everyday,
    createdAt: '2026-04-25T01:00:00.000Z',
    updatedAt: '2026-08-01T01:00:00.000Z',
    version: 3
  },
  {
    id: MANDATE_IDS.cancelled,
    status: 'CANCELLED',
    initiator: 'Imaginary Insurance',
    shortDescription: 'Contents insurance',
    description: 'Annual contents insurance premium',
    purpose: 'Insurance',
    amountType: 'FIXE',
    frequency: 'ANNUALLY',
    amountCents: 92000,
    maxAmountCents: 92000,
    conditionsOfPayment: null,
    firstPayment: null,
    lastPayment: null,
    startDate: '2025-06-01',
    endDate: '2026-06-01',
    autoRenew: false,
    migratedFromDirectDebit: false,
    pendingAmendment: null,
    accountNo: ACCOUNT_NOS.savings,
    createdAt: '2025-05-20T01:00:00.000Z',
    updatedAt: '2026-06-15T01:00:00.000Z',
    version: 3
  },
  {
    id: MANDATE_IDS.created,
    status: 'CREATED',
    initiator: 'Example Gym Group',
    shortDescription: 'Gym membership',
    description: 'Monthly gym membership',
    purpose: 'Health and fitness',
    amountType: 'FIXE',
    frequency: 'MONTHLY',
    amountCents: 5500,
    maxAmountCents: 5500,
    conditionsOfPayment: 'Standard tier billed monthly.',
    firstPayment: { amountCents: 5500, date: '2026-11-15' },
    lastPayment: { amountCents: 5500, date: '2027-10-15' },
    startDate: '2026-11-15',
    endDate: '2027-10-31',
    autoRenew: false,
    migratedFromDirectDebit: false,
    pendingAmendment: null,
    accountNo: ACCOUNT_NOS.everyday,
    createdAt: '2026-11-03T01:00:00.000Z',
    updatedAt: '2026-11-05T02:00:00.000Z',
    version: 1
  }
]

const idSuffix = (id: MandateId): string => id.slice(-4)

function metaOf(s: MandateSpec): MandateMetaItem {
  return {
    PK: mandatePk(s.id),
    SK: SK.mandateMeta,
    entity: 'MANDATE_META',
    mandateId: s.id,
    capId: INDIVIDUAL.capId,
    initiator: s.initiator,
    description: s.description,
    shortDescription: s.shortDescription,
    purpose: s.purpose,
    paymentReference: `REF-${idSuffix(s.id)}`,
    conditionsOfPayment: s.conditionsOfPayment,
    amountCents: s.amountCents,
    maxAmountCents: s.maxAmountCents,
    firstPaymentAmountCents: s.firstPayment?.amountCents ?? null,
    firstPaymentDate: s.firstPayment?.date ?? null,
    lastPaymentAmountCents: s.lastPayment?.amountCents ?? null,
    lastPaymentDate: s.lastPayment?.date ?? null,
    frequency: s.frequency,
    amountType: s.amountType,
    startDate: s.startDate,
    endDate: s.endDate,
    autoRenew: s.autoRenew,
    migratedFromDirectDebit: s.migratedFromDirectDebit,
    payerName: PAYER,
    ultimatePayer: null,
    accountNo: s.accountNo,
    bsb: BSB,
    status: s.status,
    version: s.version,
    pendingAmendment: s.pendingAmendment,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt
  }
}

function summaryOf(m: MandateMetaItem): CustomerMandateItem {
  return {
    PK: customerPk(m.capId),
    SK: SK.customerMandate(m.mandateId),
    entity: 'CUSTOMER_MANDATE',
    capId: m.capId,
    mandateId: m.mandateId,
    initiator: m.initiator,
    shortDescription: m.shortDescription,
    maxAmountCents: m.maxAmountCents,
    amountCents: m.amountCents,
    frequency: m.frequency,
    amountType: m.amountType,
    status: m.status,
    hasPendingAmendment: m.pendingAmendment !== null,
    ...gsi2ForMandate(m.capId, m.status, m.mandateId)
  }
}

const mandateMetas: MandateMetaItem[] = specs.map(metaOf)
const customerMandates: CustomerMandateItem[] = mandateMetas.map(summaryOf)

// ---- events ----
interface EventSpec {
  at: IsoTimestamp
  action: MandateAction
  from: MandateStatus
  to: MandateStatus
  reasonCode: ReasonCode | null
  actor: string
}

function eventsFor(id: MandateId, list: EventSpec[]): MandateEventItem[] {
  return list.map((e, i) => ({
    PK: mandatePk(id),
    SK: SK.event(e.at, i + 1),
    entity: 'MANDATE_EVENT',
    mandateId: id,
    at: e.at,
    action: e.action,
    fromStatus: e.from,
    toStatus: e.to,
    reasonCode: e.reasonCode,
    reasonDescription: e.reasonCode ? reasonDescription(e.reasonCode) : null,
    actor: e.actor,
    requestId: `seed-${idSuffix(id)}-${String(i + 1).padStart(2, '0')}`
  }))
}

const accept = (at: IsoTimestamp): EventSpec => ({
  at,
  action: 'accept',
  from: 'CREATED',
  to: 'ACTIVE',
  reasonCode: null,
  actor: 'customer'
})

const events: MandateEventItem[] = [
  ...eventsFor(MANDATE_IDS.activeFixed, [accept('2026-01-10T01:00:00.000Z')]),
  ...eventsFor(MANDATE_IDS.activeVariable, [accept('2026-01-25T01:00:00.000Z')]),
  ...eventsFor(MANDATE_IDS.activeUsage, [accept('2026-02-20T01:00:00.000Z')]),
  ...eventsFor(MANDATE_IDS.activeBalance, [accept('2026-03-30T01:00:00.000Z')]),
  ...eventsFor(MANDATE_IDS.paused, [
    accept('2026-04-25T01:00:00.000Z'),
    { at: '2026-05-20T01:00:00.000Z', action: 'pause', from: 'ACTIVE', to: 'PAUSED', reasonCode: 'AC02', actor: 'system' },
    { at: '2026-06-02T01:00:00.000Z', action: 'resume', from: 'PAUSED', to: 'ACTIVE', reasonCode: null, actor: 'banker.demo' },
    { at: '2026-07-10T01:00:00.000Z', action: 'amend', from: 'ACTIVE', to: 'ACTIVE', reasonCode: 'AM12', actor: 'system' },
    { at: '2026-08-01T01:00:00.000Z', action: 'pause', from: 'ACTIVE', to: 'PAUSED', reasonCode: 'AC13', actor: 'system' }
  ]),
  ...eventsFor(MANDATE_IDS.cancelled, [
    accept('2025-05-20T01:00:00.000Z'),
    { at: '2026-03-01T01:00:00.000Z', action: 'pause', from: 'ACTIVE', to: 'PAUSED', reasonCode: null, actor: 'banker.demo' },
    { at: '2026-06-15T01:00:00.000Z', action: 'cancel', from: 'PAUSED', to: 'CANCELLED', reasonCode: 'MD16', actor: 'banker.demo' }
  ])
]

// ---- transactions (all on activeFixed) ----
const TXN_SPECS: ReadonlyArray<readonly [IsoTimestamp, string, number, TxnStatus]> = [
  ['2026-05-15T00:00:00.000Z', 'Sampleco Energy May', 17650, 'POSTED'],
  ['2026-06-15T00:00:00.000Z', 'Sampleco Energy Jun', 18000, 'POSTED'],
  ['2026-07-15T00:00:00.000Z', 'Sampleco Energy Jul', 18000, 'POSTED'],
  ['2026-08-15T00:00:00.000Z', 'Sampleco Energy Aug', 18000, 'FAILED'],
  ['2026-08-18T00:00:00.000Z', 'Sampleco Energy Aug retry', 18000, 'POSTED'],
  ['2026-09-15T00:00:00.000Z', 'Sampleco Energy Sep', 18000, 'POSTED'],
  ['2026-10-15T00:00:00.000Z', 'Sampleco Energy Oct', 18000, 'POSTED'],
  ['2026-11-15T00:00:00.000Z', 'Sampleco Energy Nov', 18000, 'PENDING']
]

const transactions: MandateTxnItem[] = TXN_SPECS.map(([at, description, amountCents, status]) => ({
  PK: mandatePk(MANDATE_IDS.activeFixed),
  SK: SK.txn(at),
  entity: 'MANDATE_TXN',
  mandateId: MANDATE_IDS.activeFixed,
  at,
  description,
  amountCents,
  status
}))

export const fixtures = {
  now: FIXTURE_NOW,
  customers,
  crnMaps,
  accounts,
  mandateMetas,
  customerMandates,
  events,
  transactions
} as const

export const allItems: readonly TableItem[] = [
  ...crnMaps,
  ...customers,
  ...accounts,
  ...customerMandates,
  ...mandateMetas,
  ...events,
  ...transactions
]
