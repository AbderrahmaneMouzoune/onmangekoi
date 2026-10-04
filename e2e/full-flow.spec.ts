import { expect, test } from './support/i18n'

import type { Browser, Page } from '@playwright/test'

/**
 * Flow complet du MVP : deux navigateurs isolés (host + invité).
 *  1. Le host choisit un pseudo et crée une session avec deux restaurants.
 *  2. L'invité ouvre le lien d'invitation, passe par l'onboarding et revient
 *     automatiquement dans la salle d'attente (le `?next=` est conservé).
 *  3. L'invité apporte son resto : le host le voit arriver en temps réel.
 *  4. Le host lance ; chacun vote ; la session se clôture toute seule.
 *  5. Les deux voient le classement, avec le coup de cœur en tête.
 *  6. Le host ouvre le lien public : un inconnu, sans pseudo ni cookie, lit
 *     le podium — et n'y trouve le pseudo de personne.
 *
 * Il tourne dans chaque langue du projet (`support/i18n.ts`) : les libellés
 * viennent des messages, les pseudos et les noms restent des données.
 */
test.describe('Session de vote complète', () => {
  test.skip(process.env.E2E !== '1', 'Nécessite une stack Supabase locale (E2E=1).')

  test('du pseudo au classement', async ({ browser, i18n: { locale, t, match } }) => {
    const host = await newPage(browser)
    const guest = await newPage(browser)

    // La langue du navigateur est celle de la page, jusque dans `<html lang>`.
    await host.goto('/')
    await expect(host.locator('html')).toHaveAttribute('lang', locale)

    // 1. Host : onboarding + création
    await host.goto('/sessions/new')
    await expect(host).toHaveURL(/\/setup\?next=/)
    await host.getByLabel(t('onboarding.pseudo.label')).fill('Alex')
    await host.getByRole('button', { name: t('onboarding.pseudo.submit') }).click()
    await expect(host).toHaveURL(/\/sessions\/new$/)

    await host.getByLabel(t('session.create.steps.name')).fill('E2E lunch')
    const results = host.getByRole('list', { name: t('restaurants.catalog.label') })
    await results.getByRole('checkbox').nth(0).click()
    await results.getByRole('checkbox').nth(1).click()
    await host.getByRole('button', { name: t('session.create.submit', { count: 2 }) }).click()
    // URL lisible : le code d'invitation, pas d'uuid
    await expect(host).toHaveURL(/\/sessions\/[0-9A-HJKMNP-TV-Z]{6}$/)
    await expect(host.getByRole('heading', { name: 'E2E lunch' })).toBeVisible()

    const code = await host.getByTestId('invite-code').getAttribute('data-code')
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/)
    const sessionUrl = host.url()
    // Le QR s'agrandit d'un geste : c'est ainsi qu'on le fait scanner à table
    const qrTrigger = host.getByRole('button', { name: t('session.invite.enlarge') })
    await expect(qrTrigger).toBeVisible()
    await qrTrigger.click()
    const qr = host.getByRole('img', { name: t('session.invite.qrLabel') })
    await expect(qr).toBeVisible()
    await host.getByRole('button', { name: t('session.invite.close'), exact: true }).click()
    await expect(qr).toBeHidden()

    // 2. Invité : lien → onboarding → salle d'attente
    await guest.goto('/join')
    await expect(guest).toHaveURL(/\/setup\?next=%2Fjoin/)
    await guest.getByLabel(t('onboarding.pseudo.label')).fill('Sam')
    await guest.getByRole('button', { name: t('onboarding.pseudo.submit') }).click()
    await expect(guest).toHaveURL(/\/join$/)
    await guest.getByLabel(t('session.join.label')).fill(code as string)
    await guest.getByRole('button', { name: t('common.actions.join') }).click()
    await expect(guest).toHaveURL(sessionUrl)
    await expect(guest.getByText(t('session.waiting.waitingFor', { host: 'Alex' }))).toBeVisible()

    // Le host voit arriver Sam en temps réel
    await expect(host.getByText('Sam')).toBeVisible()
    await expect(host.getByText(t('common.counts.participants', { count: 2 }))).toBeVisible()

    // 3. Sam apporte son resto — inviter et compléter le deck ne sont pas des
    // privilèges de host : il voit le code d'invitation et le bouton d'ajout.
    await expect(guest.getByTestId('invite-code')).toBeVisible()
    await guest.getByRole('button', { name: t('session.sessionRestaurants.addMine') }).click()
    const guestResults = guest.getByRole('list', { name: t('restaurants.catalog.label') })
    await guestResults.getByRole('checkbox').nth(2).click()
    await guest
      .getByRole('button', { name: t('session.sessionRestaurants.add', { count: 1 }), exact: true })
      .click()

    // Le host voit le deck grossir sans recharger
    await expect(host.getByText(t('session.sessionRestaurants.title', { count: 3 }))).toBeVisible({
      timeout: 15_000,
    })

    // 4. Lancement et votes
    await host.getByRole('button', { name: t('session.waiting.launch') }).click()
    await expect(host.getByRole('group', { name: t('session.vote.group') })).toBeVisible()
    await expect(guest.getByRole('group', { name: t('session.vote.group') })).toBeVisible()

    const fav = match('session.vote.actions.fav')
    const no = match('session.vote.actions.no')
    const yes = match('session.vote.actions.yes')
    await host.getByRole('button', { name: fav }).click()
    await expect(host.getByRole('button', { name: fav })).toBeDisabled()
    await host.getByRole('button', { name: no }).click()
    await host.getByRole('button', { name: no }).click()
    await expect(host.getByText(t('session.finished.allVoted'))).toBeVisible()

    await guest.getByRole('button', { name: yes }).click()
    await guest.getByRole('button', { name: match('session.vote.actions.veto') }).click()
    await guest.getByRole('button', { name: yes }).click()

    // 5. Clôture automatique → classement pour les deux
    await expect(host).toHaveURL(/\/results$/, { timeout: 15_000 })
    await expect(guest).toHaveURL(/\/results$/, { timeout: 15_000 })
    await expect(host.getByText(t('session.results.eyebrow.winner'), { exact: true })).toBeVisible()
    await expect(host.getByText('+3')).toBeVisible()
    await expect(guest.getByText('−2')).toBeVisible()
    const resultsUrl = host.url()

    // 6. Partage public : opt-in du host, puis lecture par un inconnu
    const share = host.getByRole('switch', { name: t('session.sharing.makePublic') })
    await expect(share).toHaveAttribute('aria-checked', 'false')
    // L'invité n'est pas host : la bascule n'existe que chez Alex.
    await expect(guest.getByRole('switch')).toHaveCount(0)

    await share.click()
    await expect(host.getByRole('switch', { name: t('session.sharing.publicOn') })).toHaveAttribute(
      'aria-checked',
      'true'
    )

    // L'attribut n'arrive qu'une fois l'ouverture confirmée en base : l'attendre,
    // c'est éviter d'ouvrir le lien avant que la bascule ait atteint Supabase.
    const shareActions = host.getByTestId('results-share-actions')
    await expect(shareActions).toHaveAttribute('data-public-url', /\/r\/[0-9A-HJKMNP-TV-Z]{10}$/)
    const publicUrl = await shareActions.getAttribute('data-public-url')

    // Le gagnant lu chez le host : c'est lui qu'on doit retrouver publié.
    const winnerName = await host.locator('#winner-title').innerText()

    const stranger = await newPage(browser)
    await stranger.goto(publicUrl as string)
    await expect(stranger.getByRole('heading', { name: 'E2E lunch' })).toBeVisible()
    await expect(stranger.getByRole('heading', { name: winnerName })).toBeVisible()
    // Texte exact : le titre de l'onglet reprend « On mange chez <resto> ».
    await expect(
      stranger.getByText(t('session.results.eyebrow.winner'), { exact: true })
    ).toBeVisible()
    await expect(stranger.getByText(t('common.counts.participants', { count: 2 }))).toBeVisible()
    // Aucun pseudo sur la page publique — c'est tout l'enjeu.
    await expect(stranger.getByText('Alex')).toHaveCount(0)
    await expect(stranger.getByText('Sam')).toHaveCount(0)
    // Et rien n'y donne accès à la salle de vote.
    await expect(stranger).toHaveURL(publicUrl as string)

    // 7. La session close reste consultable depuis l'historique et le compte
    await host.goto('/sessions')
    const historyRow = host.getByRole('link', { name: /E2E lunch/ })
    await expect(historyRow).toBeVisible()
    await expect(host.getByText('+3')).toBeVisible()
    await historyRow.click()
    await expect(host).toHaveURL(resultsUrl)

    await host.goto('/account')
    await expect(host.getByRole('heading', { name: t('account.stats.title') })).toBeVisible()
    await expect(host.getByText(t('account.stats.topRestaurantHint', { count: 1 }))).toBeVisible()
  })
})

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  return context.newPage()
}
