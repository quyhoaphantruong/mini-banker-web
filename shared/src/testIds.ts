/** data-testid values. The frontend renders them and e2e queries them. Change both together. */
export const TEST_IDS = {
  loginButton: 'login-button',
  notAuthorised: 'not-authorised',
  errorBanner: 'error-banner',
  crnInput: 'crn-input',
  searchButton: 'search-button',
  customerName: 'customer-name',
  customerTypeBadge: 'customer-type',
  tabProfile: 'tab-profile',
  tabAccounts: 'tab-accounts',
  tabCustomerSettings: 'tab-customer-settings',
  settingsTabPayTo: 'settings-tab-payto',
  accountRow: 'account-row',
  mandatesTabActive: 'mandates-tab-active',
  mandatesTabCreated: 'mandates-tab-created',
  mandatesTabPaused: 'mandates-tab-paused',
  mandatesTabCancelled: 'mandates-tab-cancelled',
  mandatesEmpty: 'mandates-empty',
  mandateCard: 'mandate-card',
  mandateViewDetails: 'mandate-view-details',
  mandateActionRequired: 'mandate-action-required',
  mandateUpdatedBadge: 'mandate-updated-badge',
  mandateEventRow: 'mandate-event-row',
  mandateTxnRow: 'mandate-txn-row',
  backToMandates: 'back-to-mandates',
  cancelMandateButton: 'cancel-mandate-button',
  cancelConfirmButton: 'cancel-confirm-button',
  cancelDismissButton: 'cancel-dismiss-button'
} as const

export type TestId = (typeof TEST_IDS)[keyof typeof TEST_IDS]