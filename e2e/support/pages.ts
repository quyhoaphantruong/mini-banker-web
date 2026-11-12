import { expect, type Locator, type Page } from '@playwright/test'
import { TEST_IDS, type TestId } from '@mbd/shared'

export const byId = (page: Page | Locator, id: TestId): Locator => page.getByTestId(id)

/** Goes to the search screen. Navigation lives in React state, so every test starts here. */
export async function openApp(page: Page): Promise<void> {
  await page.goto('/')
  await expect(byId(page, TEST_IDS.crnInput)).toBeVisible()
}

export async function searchCrn(page: Page, crn: string): Promise<void> {
  await byId(page, TEST_IDS.crnInput).fill(crn)
  await byId(page, TEST_IDS.searchButton).click()
}

/** From the search screen, opens the customer's Customer settings > PayTo tab. */
export async function openPayTo(page: Page, crn: string): Promise<void> {
  await searchCrn(page, crn)
  await expect(byId(page, TEST_IDS.customerName)).toBeVisible()
  await byId(page, TEST_IDS.tabCustomerSettings).click()
  await byId(page, TEST_IDS.settingsTabPayTo).click()
  await expect(byId(page, TEST_IDS.mandatesTabActive)).toBeVisible()
}
