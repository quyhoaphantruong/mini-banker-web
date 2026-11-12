import { defineConfig, devices } from '@playwright/test'
import {
  BACKEND_PORT,
  DYNAMODB_ENDPOINT,
  DYNAMODB_PORT,
  FRONTEND_PORT,
  FRONTEND_URL,
  REGION,
  SIMULATE_SEARCH_500_CRN,
  TABLE_NAME
} from './support/env.js'

const ci = !!process.env['CI']

export default defineConfig({
  testDir: './tests',
  globalSetup: './support/globalSetup.ts',
  fullyParallel: false,
  workers: 1,
  retries: ci ? 1 : 0,
  reporter: ci ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: { baseURL: FRONTEND_URL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'docker compose up dynamodb-local',
      cwd: '..',
      port: DYNAMODB_PORT,
      reuseExistingServer: !ci,
      timeout: 120_000
    },
    {
      command: 'npm run dev -w backend',
      cwd: '..',
      port: BACKEND_PORT,
      reuseExistingServer: !ci,
      timeout: 120_000,
      env: {
        DEV_AUTH: '1',
        PORT: String(BACKEND_PORT),
        DYNAMODB_ENDPOINT,
        TABLE_NAME,
        AWS_REGION: REGION,
        AWS_ACCESS_KEY_ID: 'local',
        AWS_SECRET_ACCESS_KEY: 'local',
        // backend/src/config.ts reads the plural name.
        SIMULATE_SEARCH_500_CRNS: SIMULATE_SEARCH_500_CRN
      }
    },
    {
      command: 'npm run dev -w frontend',
      cwd: '..',
      url: FRONTEND_URL,
      reuseExistingServer: !ci,
      timeout: 120_000
    }
  ]
})
