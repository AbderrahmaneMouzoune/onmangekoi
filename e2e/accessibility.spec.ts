import { auditA11y, expectVisibleFocusRing, useDarkTheme } from './support/a11y'
import { expect, test, type E2eI18n } from './support/i18n'

import type { Browser, Page } from '@playwright/test'

/**
 * Audit d'accessibilité du parcours complet.
 *
 * Chaque page traversée passe sous axe (normes WCAG 2.1 A et AA) et toute
 * violation `serious` ou `critical` fait échouer le job. S'y ajoutent les deux
 * choses qu'un scan automatique ne voit pas : le focus reste visible à la
 * tabulation, et le deck se pilote entièrement au clavier — annonce du
 * restaurant courant comprise. Dans chaque langue du projet : un libellé
 * anglais trop long ou une annonce mal accordée se voient aussi.
 */
test.describe('Accessibilité', () => {
  test.skip(process.env.E2E !== '1', 'Nécessite une stack Supabase locale (E2E=1).')

  test('pages publiques : accueil, connexion, confidentialité, pseudo', async ({
    page,
    i18n: { t },
  }, testInfo) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await auditA11y(page, testInfo, 'accueil')

    // La charte a deux thèmes : le contraste doit tenir dans les deux.
    await useDarkTheme(page)
    await auditA11y(page, testInfo, 'accueil (sombre)')
    await page.emulateMedia({ colorScheme: 'light' })

    await page.goto('/login')
    await expect(page.getByLabel(t('account.login.email'))).toBeVisible()
    await auditA11y(page, testInfo, 'connexion')
    await expectVisibleFocusRing(page, 6)

    await page.goto('/legal/privacy')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await auditA11y(page, testInfo, 'confidentialité')

    // « Rejoindre » est derrière le pseudo : sans lui, on atterrit sur /setup.
    await page.goto('/join')
    await expect(page).toHaveURL(/\/setup\?next=%2Fjoin/)
    await expect(page.getByLabel(t('onboarding.pseudo.label'))).toBeVisible()
    await auditA11y(page, testInfo, 'pseudo')
  })

  test('parcours de session : pseudo, salle d’attente, vote, classement', async ({
    browser,
    i18n: { t, match },
  }, testInfo) => {
    const host = await newPage(browser)
    const guest = await newPage(browser)

    // 1. Onboarding
    await host.goto('/sessions/new')
    await expect(host).toHaveURL(/\/setup\?next=/)
    await host.getByLabel(t('onboarding.pseudo.label')).fill('Alex')
    await host.getByRole('button', { name: t('onboarding.pseudo.submit') }).click()

    // 2. Création
    await expect(host).toHaveURL(/\/sessions\/new$/)
    await host.getByLabel(t('session.create.steps.name')).fill('E2E a11y')
    const results = host.getByRole('list', { name: t('restaurants.catalog.label') })
    await results.getByRole('checkbox').nth(0).click()
    await results.getByRole('checkbox').nth(1).click()
    await auditA11y(host, testInfo, 'nouvelle session')
    await host.getByRole('button', { name: t('session.create.submit', { count: 2 }) }).click()
    await expect(host).toHaveURL(/\/sessions\/[0-9A-HJKMNP-TV-Z]{6}$/)

    const code = await host.getByTestId('invite-code').getAttribute('data-code')
    const sessionUrl = host.url()

    // 3. Salle d'attente, des deux côtés
    await auditA11y(host, testInfo, 'salle d’attente (host)')

    await guest.goto('/setup?next=%2Fjoin')
    await guest.getByLabel(t('onboarding.pseudo.label')).fill('Sam')
    await guest.getByRole('button', { name: t('onboarding.pseudo.submit') }).click()
    await expect(guest).toHaveURL(/\/join$/)
    await expect(guest.getByLabel(t('session.join.label'))).toBeVisible()
    await auditA11y(guest, testInfo, 'rejoindre')
    await guest.getByLabel(t('session.join.label')).fill(code as string)
    await guest.getByRole('button', { name: t('common.actions.join') }).click()
    await expect(guest).toHaveURL(sessionUrl)
    await auditA11y(guest, testInfo, 'salle d’attente (invité)')

    // Le sélecteur de restaurants s'ouvre aussi depuis la salle d'attente,
    // dans une page qui n'est pas celle de la création : une surface de plus.
    await guest.getByRole('button', { name: t('session.sessionRestaurants.addMine') }).click()
    await expect(guest.getByRole('list', { name: t('restaurants.catalog.label') })).toBeVisible()
    await auditA11y(guest, testInfo, 'salle d’attente (ajout d’un resto)')
    await guest.getByRole('button', { name: t('common.actions.cancel') }).click()

    // 4. Vote : la page centrale du produit, dans les deux thèmes
    await host.getByRole('button', { name: t('session.waiting.launch') }).click()
    await expect(host.getByRole('group', { name: t('session.vote.group') })).toBeVisible()
    await expect(guest.getByRole('group', { name: t('session.vote.group') })).toBeVisible()
    await auditA11y(host, testInfo, 'vote')
    await expectVisibleFocusRing(host, 6)

    await useDarkTheme(host)
    await auditA11y(host, testInfo, 'vote (sombre)')
    await host.emulateMedia({ colorScheme: 'light' })

    // 5. Classement
    await host.getByRole('button', { name: match('session.vote.actions.fav') }).click()
    await host.getByRole('button', { name: match('session.vote.actions.no') }).click()
    await guest.getByRole('button', { name: match('session.vote.actions.yes') }).click()
    await guest.getByRole('button', { name: match('session.vote.actions.veto') }).click()

    await expect(host).toHaveURL(/\/results$/, { timeout: 15_000 })
    await expect(host.getByText(t('session.results.eyebrow.winner'), { exact: true })).toBeVisible()
    await auditA11y(host, testInfo, 'classement')

    // Le classement public : la seule page que des inconnus vont ouvrir, donc
    // celle qu'on ne peut pas se permettre de laisser hors de l'audit.
    await host.getByRole('switch', { name: t('session.sharing.makePublic') }).click()
    const shareActions = host.getByTestId('results-share-actions')
    await expect(shareActions).toHaveAttribute('data-public-url', /\/r\//)
    const publicUrl = await shareActions.getAttribute('data-public-url')
    const stranger = await newPage(browser)
    await stranger.goto(publicUrl as string)
    await expect(stranger.getByRole('heading', { level: 1 })).toBeVisible()
    await auditA11y(stranger, testInfo, 'classement public')

    await useDarkTheme(stranger)
    await auditA11y(stranger, testInfo, 'classement public (sombre)')

    await useDarkTheme(host)
    await auditA11y(host, testInfo, 'classement (sombre)')

    // 6. Listes
    await host.goto('/lists')
    await auditA11y(host, testInfo, 'listes')
    await host.goto('/lists/new')
    await auditA11y(host, testInfo, 'nouvelle liste')
    await host.goto('/account')
    // La section des contraintes alimentaires (#60) arrive en streaming :
    // l'audit l'attend, cases et boutons radio compris.
    await expect(
      host.getByRole('heading', { name: t('account.foodConstraints.title') })
    ).toBeVisible()
    await expect(
      host.getByRole('radio', { name: t('account.foodConstraints.noCap') })
    ).toBeVisible()
    await auditA11y(host, testInfo, 'compte')
  })

  test('deck : tout le vote au clavier, annoncé à chaque carte', async ({ browser, i18n }) => {
    const { t, match } = i18n
    const host = await newPage(browser)
    const guest = await newPage(browser)

    const code = await createSession(host, 'Clavier', i18n)
    await joinSession(guest, code, i18n)
    await host.getByRole('button', { name: t('session.waiting.launch') }).click()
    await expect(host.getByRole('group', { name: t('session.vote.group') })).toBeVisible()

    // Les raccourcis sont annoncés sur les boutons eux-mêmes.
    await expect(
      host.getByRole('button', { name: match('session.vote.actions.veto') })
    ).toHaveAttribute('aria-keyshortcuts', '1')
    await expect(
      host.getByRole('button', { name: match('session.vote.actions.yes') })
    ).toHaveAttribute('aria-keyshortcuts', '3 ArrowRight Enter')

    // La carte courante est annoncée sans que le focus ait à la trouver.
    const live = host.locator('[aria-live="polite"][aria-atomic="true"]')
    await expect(live).toHaveText(
      match('session.deck.announce', { position: 1, total: 2 }, { exact: true })
    )
    const progress = host.getByRole('progressbar', { name: t('session.deck.progress') })
    await expect(progress).toHaveAttribute('aria-valuenow', '0')

    // 1–4 : chaque chiffre vote comme le bouton au-dessus duquel il tombe.
    await host.keyboard.press('4')
    await expect(live).toHaveText(
      match(
        'session.deck.announceAfterVote',
        { vote: t('session.vote.actions.fav'), position: 2, total: 2 },
        { exact: true }
      )
    )
    await expect(progress).toHaveAttribute('aria-valuenow', '1')
    await expect(
      host.getByRole('button', { name: match('session.vote.actions.fav') })
    ).toBeDisabled()

    // Flèches et Entrée finissent le deck sans jamais quitter le clavier.
    await host.keyboard.press('ArrowLeft')
    await expect(host.getByText(t('session.finished.allVoted'))).toBeVisible()

    // L'invité termine à la flèche puis à Entrée : la session se clôt seule.
    await guest.keyboard.press('ArrowRight')
    await expect(guest.locator('[aria-live="polite"][aria-atomic="true"]')).toHaveText(
      match(
        'session.deck.announceAfterVote',
        { vote: t('session.vote.actions.yes'), position: 2, total: 2 },
        { exact: true }
      )
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
async function createSession(page: Page, name: string, { t }: E2eI18n): Promise<string> {
  await page.goto('/sessions/new')
  await expect(page).toHaveURL(/\/setup\?next=/)
  await page.getByLabel(t('onboarding.pseudo.label')).fill('Alex')
  await page.getByRole('button', { name: t('onboarding.pseudo.submit') }).click()
  await expect(page).toHaveURL(/\/sessions\/new$/)

  await page.getByLabel(t('session.create.steps.name')).fill(name)
  const results = page.getByRole('list', { name: t('restaurants.catalog.label') })
  await results.getByRole('checkbox').nth(0).click()
  await results.getByRole('checkbox').nth(1).click()
  await page.getByRole('button', { name: t('session.create.submit', { count: 2 }) }).click()
  await expect(page).toHaveURL(/\/sessions\/[0-9A-HJKMNP-TV-Z]{6}$/)

  const code = await page.getByTestId('invite-code').getAttribute('data-code')
  expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/)
  return code as string
}

/** Invité : pseudo puis code, jusqu'à la salle d'attente. */
async function joinSession(page: Page, code: string, { t }: E2eI18n): Promise<void> {
  await page.goto('/setup?next=%2Fjoin')
  await page.getByLabel(t('onboarding.pseudo.label')).fill('Sam')
  await page.getByRole('button', { name: t('onboarding.pseudo.submit') }).click()
  await expect(page).toHaveURL(/\/join$/)
  await page.getByLabel(t('session.join.label')).fill(code)
  await page.getByRole('button', { name: t('common.actions.join') }).click()
  await expect(page).toHaveURL(/\/sessions\/[0-9A-HJKMNP-TV-Z]{6}$/)
}
