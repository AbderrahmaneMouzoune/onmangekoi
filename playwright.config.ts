import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH

/**
 * Tests de bout en bout : nécessitent une stack Supabase locale démarrée
 * (`supabase start`) et les variables NEXT_PUBLIC_* correspondantes.
 * `E2E=1` active les specs ; sans ce flag elles sont ignorées.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'fr-FR',
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.E2E_SKIP_WEBSERVER
    ? undefined
    : {
        command: 'bun run start',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
