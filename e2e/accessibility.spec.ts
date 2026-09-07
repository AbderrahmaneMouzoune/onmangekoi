import { expect, test } from '@playwright/test'

import { auditA11y, expectVisibleFocusRing, useDarkTheme } from './support/a11y'

import type { Browser, Page } from '@playwright/test'

/**
 * Audit d'accessibilité du parcours complet.
 *
 * Chaque page traversée passe sous axe (normes WCAG 2.1 A et AA) et toute
 * violation `serious` ou `critical` fait échouer le job. S'y ajoutent les deux
 * choses qu'un scan automatique ne voit pas : le focus reste visible à la
 * tabulation, et le deck se pilote entièrement au clavier — annonce du
 * restaurant courant comprise.
 */
test.describe('Accessibilité', () => {
  test.skip(process.env.E2E !== '1', 'Nécessite une stack Supabase locale (E2E=1).')

  test('pages publiques : accueil, rejoindre, connexion, confidentialité', async ({
    page,
  }, testInfo) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await auditA11y(page, testInfo, 'accueil')

    // La charte a deux thèmes : le contraste doit tenir dans les deux.
    await useDarkTheme(page)
    await auditA11y(page, testInfo, 'accueil (sombre)')
    await page.emulateMedia({ colorScheme: 'light' })

    await page.goto('/join')
    await expect(page.getByLabel(/code ou lien/i)).toBeVisible()
    await auditA11y(page, testInfo, 'rejoindre')
    await expectVisibleFocusRing(page, 6)

    await page.goto('/login')
    await auditA11y(page, testInfo, 'connexion')

    await page.goto('/legal/privacy')
    await auditA11y(page, testInfo, 'confidentialité')
  })

  test('parcours de session : pseudo, salle d’attente, vote, classement', async ({
    browser,
  }, testInfo) => {
    const host = await newPage(browser)
    const guest = await newPage(browser)

    // 1. Onboarding
    await host.goto('/sessions/new')
    await expect(host).toHaveURL(/\/setup\?next=/)
    await auditA11y(host, testInfo, 'pseudo')
    await host.getByLabel('Ton pseudo').fill('Alex')
    await host.getByRole('button', { name: /c’est parti/i }).click()

    // 2. Création
    await expect(host).toHaveURL(/\/sessions\/new$/)
    await host.getByLabel('Nom de la session').fill('E2E a11y')
    const results = host.getByRole('list', { name: 'Résultats' })
    await results.getByRole('checkbox').nth(0).click()
    await results.getByRole('checkbox').nth(1).click()
    await auditA11y(host, testInfo, 'nouvelle session')
    await host.getByRole('button', { name: /créer la session · 2 restos/i }).click()
    await expect(host).toHaveURL(/\/sessions\/[0-9A-HJKMNP-TV-Z]{6}$/)

    const code = await host.getByTestId('invite-code').getAttribute('data-code')
    const sessionUrl = host.url()

    // 3. Salle d'attente, des deux côtés
    await auditA11y(host, testInfo, 'salle d’attente (host)')

    await guest.goto('/setup?next=%2Fjoin')
    await guest.getByLabel('Ton pseudo').fill('Sam')
    await guest.getByRole('button', { name: /c’est parti/i }).click()
    await expect(guest).toHaveURL(/\/join$/)
    await guest.getByLabel(/code ou lien/i).fill(code as string)
    await guest.getByRole('button', { name: 'Rejoindre' }).click()
    await expect(guest).toHaveURL(sessionUrl)
    await auditA11y(guest, testInfo, 'salle d’attente (invité)')

    // 4. Vote : la page centrale du produit, dans les deux thèmes
    await host.getByRole('button', { name: /lancer le vote/i }).click()
    await expect(host.getByRole('group', { name: 'Voter' })).toBeVisible()
    await expect(guest.getByRole('group', { name: 'Voter' })).toBeVisible()
    await auditA11y(host, testInfo, 'vote')
    await expectVisibleFocusRing(host, 6)

    await useDarkTheme(host)
    await auditA11y(host, testInfo, 'vote (sombre)')
    await host.emulateMedia({ colorScheme: 'light' })

    // 5. Classement
    await host.getByRole('button', { name: /coup de cœur/i }).click()
    await host.getByRole('button', { name: /bof/i }).click()
    await guest.getByRole('button', { name: /ça me va/i }).click()
    await guest.getByRole('button', { name: /veto/i }).click()

    await expect(host).toHaveURL(/\/results$/, { timeout: 15_000 })
    await expect(host.getByText(/on mange chez/i)).toBeVisible()
    await auditA11y(host, testInfo, 'classement')

    await useDarkTheme(host)
    await auditA11y(host, testInfo, 'classement (sombre)')

    // 6. Listes
    await host.goto('/lists')
    await auditA11y(host, testInfo, 'listes')
    await host.goto('/lists/new')
    await auditA11y(host, testInfo, 'nouvelle liste')
    await host.goto('/account')
    await auditA11y(host, testInfo, 'compte')
  })

  test('deck : tout le vote au clavier, annoncé à chaque carte', async ({ browser }) => {
    const host = await newPage(browser)
    const guest = await newPage(browser)

    const code = await createSession(host, 'Clavier')
    await joinSession(guest, code)
    await host.getByRole('button', { name: /lancer le vote/i }).click()
    await expect(host.getByRole('group', { name: 'Voter' })).toBeVisible()

    // Les raccourcis sont annoncés sur les boutons eux-mêmes.
    await expect(host.getByRole('button', { name: /veto/i })).toHaveAttribute(
      'aria-keyshortcuts',
      '1'
    )
    await expect(host.getByRole('button', { name: /ça me va/i })).toHaveAttribute(
      'aria-keyshortcuts',
      '3 ArrowRight Enter'
    )

    // La carte courante est annoncée sans que le focus ait à la trouver.
    const live = host.locator('[aria-live="polite"][aria-atomic="true"]')
    await expect(live).toHaveText(/^Restaurant 1 sur 2 : .+\.$/)
    const progress = host.getByRole('progressbar', { name: 'Progression du vote' })
    await expect(progress).toHaveAttribute('aria-valuenow', '0')

    // 1–4 : chaque chiffre vote comme le bouton au-dessus duquel il tombe.
    await host.keyboard.press('4')
    await expect(live).toHaveText(/^Coup de cœur enregistré\. Restaurant 2 sur 2 : .+\.$/)
    await expect(progress).toHaveAttribute('aria-valuenow', '1')
    await expect(host.getByRole('button', { name: /coup de cœur/i })).toBeDisabled()

    // Flèches et Entrée finissent le deck sans jamais quitter le clavier.
    await host.keyboard.press('ArrowLeft')
    await expect(host.getByText(/tu as tout voté/i)).toBeVisible()

    // L'invité termine à la flèche puis à Entrée : la session se clôt seule.
    await guest.keyboard.press('ArrowRight')
    await expect(guest.locator('[aria-live="polite"][aria-atomic="true"]')).toHaveText(
      /^Ça me va enregistré\. Restaurant 2 sur 2 : .+\.$/
    )
    await guest.keyboard.press('Enter')

    await expect(host).toHaveURL(/\/results$/, { timeout: 15_000 })
    await expect(guest).toHaveURL(/\/results$/, { timeout: 15_000 })
  })
})

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  return context.newPage()
}

/** Host : pseudo, session à deux restaurants, retourne le code d'invitation. */
async function createSession(page: Page, name: string): Promise<string> {
  await page.goto('/sessions/new')
  await expect(page).toHaveURL(/\/setup\?next=/)
  await page.getByLabel('Ton pseudo').fill('Alex')
  await page.getByRole('button', { name: /c’est parti/i }).click()
  await expect(page).toHaveURL(/\/sessions\/new$/)

  await page.getByLabel('Nom de la session').fill(name)
  const results = page.getByRole('list', { name: 'Résultats' })
  await results.getByRole('checkbox').nth(0).click()
  await results.getByRole('checkbox').nth(1).click()
  await page.getByRole('button', { name: /créer la session · 2 restos/i }).click()
  await expect(page).toHaveURL(/\/sessions\/[0-9A-HJKMNP-TV-Z]{6}$/)

  const code = await page.getByTestId('invite-code').getAttribute('data-code')
  expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/)
  return code as string
}

/** Invité : pseudo puis code, jusqu'à la salle d'attente. */
async function joinSession(page: Page, code: string): Promise<void> {
  await page.goto('/setup?next=%2Fjoin')
  await page.getByLabel('Ton pseudo').fill('Sam')
  await page.getByRole('button', { name: /c’est parti/i }).click()
  await expect(page).toHaveURL(/\/join$/)
  await page.getByLabel(/code ou lien/i).fill(code)
  await page.getByRole('button', { name: 'Rejoindre' }).click()
  await expect(page).toHaveURL(/\/sessions\/[0-9A-HJKMNP-TV-Z]{6}$/)
}
