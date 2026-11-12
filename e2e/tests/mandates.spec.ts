import { expect, test, type Page } from '@playwright/test'
import { MANDATE_IDS, fixtures } from '@mbd/seed'
import { FIXTURE_CUSTOMERS, IDEMPOTENCY_HEADER, TEST_IDS, type MandateId, type TestId } from '@mbd/shared'
import { reseed } from '../support/db.js'
import { byId, openApp, openPayTo } from '../support/pages.js'

test.beforeEach(reseed)

const CRN = FIXTURE_CUSTOMERS.individual.crn

function meta(id: MandateId) {
  const m = fixtures.mandateMetas.find((x) => x.mandateId === id)
  if (!m) throw new Error(`No fixture META for ${id}`)
  return m
}

const eventCount = (id: MandateId) => fixtures.events.filter((e) => e.mandateId === id).length

const card = (page: Page, id: MandateId) => byId(page, TEST_IDS.mandateCard).filter({ hasText: meta(id).initiator })

async function showTab(page: Page, tab: TestId): Promise<void> {
  await byId(page, tab).click()
  await expect(byId(page, tab)).toHaveAttribute('aria-selected', 'true')
}

async function openMandate(page: Page, id: MandateId): Promise<void> {
  await card(page, id).getByTestId(TEST_IDS.mandateViewDetails).click()
  await expect(byId(page, TEST_IDS.backToMandates)).toBeVisible()
}

/** The ACTIVE mandate without a pending amendment, so its detail page is simplest to cancel. */
const TARGET = MANDATE_IDS.activeVariable

test.beforeEach(async ({ page }) => {
  await openApp(page)
  await openPayTo(page, CRN)
})

test('mandates appear on each status tab with the fixture counts', async ({ page }) => {
  const expected: [TestId, number][] = [
    [TEST_IDS.mandatesTabActive, 4],
    [TEST_IDS.mandatesTabPaused, 1],
    [TEST_IDS.mandatesTabCancelled, 1],
    [TEST_IDS.mandatesTabCreated, 1]
  ]
  for (const [tab, count] of expected) {
    await showTab(page, tab)
    await expect(byId(page, TEST_IDS.mandateCard)).toHaveCount(count)
  }
})

test('an active mandate with a pending amendment shows Action required and Updated badges', async ({ page }) => {
  const id = MANDATE_IDS.activeFixed
  expect(meta(id).pendingAmendment).not.toBeNull()

  await openMandate(page, id)
  await expect(byId(page, TEST_IDS.mandateActionRequired)).toBeVisible()
  await expect(byId(page, TEST_IDS.mandateUpdatedBadge).first()).toBeVisible()
})

test('cancelling an active mandate adds one history row and moves it to Cancelled', async ({ page }) => {
  const before = eventCount(TARGET)

  await openMandate(page, TARGET)
  await expect(byId(page, TEST_IDS.mandateEventRow)).toHaveCount(before)

  await byId(page, TEST_IDS.cancelMandateButton).click()
  await byId(page, TEST_IDS.cancelConfirmButton).click()

  await expect(byId(page, TEST_IDS.cancelConfirmButton)).toBeHidden()
  await expect(byId(page, TEST_IDS.mandateEventRow)).toHaveCount(before + 1)
  await expect(byId(page, TEST_IDS.cancelMandateButton)).toBeHidden()

  await byId(page, TEST_IDS.backToMandates).click()
  await showTab(page, TEST_IDS.mandatesTabActive)
  await expect(byId(page, TEST_IDS.mandateCard)).toHaveCount(3)
  await expect(card(page, TARGET)).toHaveCount(0)

  await showTab(page, TEST_IDS.mandatesTabCancelled)
  await expect(card(page, TARGET)).toHaveCount(1)
})

test('retrying a cancel after a lost response does not cancel twice', async ({ page }) => {
  const before = eventCount(TARGET)
  const keys: (string | undefined)[] = []
  let first = true

  await page.route('**/api/mandates/*/cancel', async (route) => {
    keys.push(route.request().headers()[IDEMPOTENCY_HEADER.toLowerCase()])
    if (first) {
      first = false
      // Let the request reach the server, then lose the response.
      await route.fetch()
      await route.abort('connectionreset')
      return
    }
    await route.continue()
  })

  await openMandate(page, TARGET)
  await byId(page, TEST_IDS.cancelMandateButton).click()

  await byId(page, TEST_IDS.cancelConfirmButton).click()
  // The failed attempt keeps the dialog open with a retry button.
  await expect(byId(page, TEST_IDS.cancelConfirmButton)).toHaveText(/retry/i)
  await byId(page, TEST_IDS.cancelConfirmButton).click()

  await expect(byId(page, TEST_IDS.cancelConfirmButton)).toBeHidden()
  await expect(byId(page, TEST_IDS.mandateEventRow)).toHaveCount(before + 1)

  expect(keys).toHaveLength(2)
  expect(keys[0]).toBeTruthy()
  expect(keys[1]).toBe(keys[0])
})
