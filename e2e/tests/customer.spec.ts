import { expect, test } from '@playwright/test'
import { fixtures } from '@mbd/seed'
import { CRN_NOT_FOUND, CRN_SIMULATED_500, FIXTURE_CUSTOMERS, TEST_IDS } from '@mbd/shared'
import { reseed } from '../support/db.js'
import { byId, openApp, searchCrn } from '../support/pages.js'

test.beforeEach(reseed)

const NOT_FOUND_TEXT = /no customer found/i
const SYSTEM_ERROR_TEXT = /system not available/i

test('dev auth lands on the search screen', async ({ page }) => {
  await openApp(page)
  await expect(byId(page, TEST_IDS.loginButton)).toHaveCount(0)
  await expect(byId(page, TEST_IDS.notAuthorised)).toHaveCount(0)
})

test('a 403 from launch shows the not-authorised screen', async ({ page }) => {
  await page.route('**/api/launch', (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'FORBIDDEN', message: 'Not a banker' })
    })
  )
  await page.goto('/')
  await expect(byId(page, TEST_IDS.notAuthorised)).toBeVisible()
  await expect(byId(page, TEST_IDS.crnInput)).toHaveCount(0)
})

test('searching the individual CRN shows the customer', async ({ page }) => {
  const customer = fixtures.customers.find((c) => c.capId === FIXTURE_CUSTOMERS.individual.capId)
  if (!customer) throw new Error('individual fixture customer missing')

  await openApp(page)
  await searchCrn(page, FIXTURE_CUSTOMERS.individual.crn)
  await expect(byId(page, TEST_IDS.customerName)).toHaveText(customer.fullName)
})

test('an unknown CRN shows the not-found banner', async ({ page }) => {
  await openApp(page)
  await searchCrn(page, CRN_NOT_FOUND)
  const banner = byId(page, TEST_IDS.errorBanner)
  await expect(banner).toBeVisible()
  await expect(banner).toContainText(NOT_FOUND_TEXT)
  await expect(byId(page, TEST_IDS.customerName)).toHaveCount(0)
})

test('the simulated-500 CRN shows a system error, not not-found', async ({ page }) => {
  await openApp(page)
  await searchCrn(page, CRN_SIMULATED_500)
  const banner = byId(page, TEST_IDS.errorBanner)
  await expect(banner).toBeVisible()
  await expect(banner).toContainText(SYSTEM_ERROR_TEXT)
  await expect(banner).not.toContainText(NOT_FOUND_TEXT)
})
