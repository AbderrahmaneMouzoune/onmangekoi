import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH

/**
 * Tests de bout en bout : nécessitent une stack Supabase locale démarrée
 * (`supabase start`) et les variables NEXT_PUBLIC_* correspondantes.
 * `E2E=1` active les specs ; sans ce flag elles sont ignorées.
 *
 * Le captcha de l'onboarding reste désactivé ici : il ne s'allume qu'avec
 * `NEXT_PUBLIC_TURNSTILE_SITE_KEY` **et** `TURNSTILE_SECRET_KEY`, qu'on ne
 * définit pas pour les tests — sinon aucun scénario ne passerait l'écran du
 * pseudo sans résoudre un défi Cloudflare.
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
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  /**
   * Chaque parcours tourne en français et en anglais (issue #14) : la langue
   * est celle du navigateur (`Accept-Language`), et les specs lisent leurs
   * libellés dans `messages/<langue>/` (`e2e/support/i18n.ts`). `i18n.spec.ts`
   * part toujours d'un navigateur anglais pour tester le passage d'une langue
   * à l'autre : les projets anglais l'ignorent, il s'y répéterait.
   */
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], locale: 'fr-FR' } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], locale: 'fr-FR' } },
    {
      name: 'mobile-en',
      use: { ...devices['Pixel 7'], locale: 'en-US' },
      testIgnore: 'i18n.spec.ts',
    },
    {
      name: 'desktop-en',
      use: { ...devices['Desktop Chrome'], locale: 'en-US' },
      testIgnore: 'i18n.spec.ts',
    },
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
