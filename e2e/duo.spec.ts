import { expect, test } from './support/i18n'

import type { Browser, Page } from '@playwright/test'

/**
 * Mode duo (issue #61) : décider à deux, sans salle d'attente ni code.
 *  1. `/duo` sans pseudo passe par l'onboarding, puis y revient.
 *  2. Deux restos, « C'est parti » : la session part en vote, « Envoie ce
 *     lien » au-dessus du deck — pas de code à dicter.
 *  3. Le second ouvre le lien sans pseudo : `/setup` reprend la destination,
 *     et il arrive directement sur le deck.
 *  4. Une troisième personne est refusée : deux places.
 *  5. « Bof » d'un côté, « ça me va » de l'autre : rien ne se ferme.
 *  6. Le premier « ça me va » commun ferme la session pour les deux, sans
 *     recharger : « C'est d'accord », un résultat et pas un classement.
 */
test.describe('Mode duo', () => {
  test.skip(process.env.E2E !== '1', 'Nécessite une stack Supabase locale (E2E=1).')

  test('décider à deux au premier accord', async ({ browser, i18n: { t, match } }) => {
    const host = await newPage(browser)
    const partner = await newPage(browser)
    const third = await newPage(browser)

    // 1. L'onboarding reprend la destination
    await host.goto('/duo')
    await expect(host).toHaveURL(/\/setup\?next=%2Fduo$/)
    await host.getByLabel(t('onboarding.pseudo.label')).fill('Alex')
    await host.getByRole('button', { name: t('onboarding.pseudo.submit') }).click()
    await expect(host).toHaveURL(/\/duo$/)

    // 2. Deux restos, et c'est parti — sans nom, sans échéance, sans règles
    const results = host.getByRole('list', { name: t('restaurants.catalog.label') })
    await results.getByRole('checkbox').nth(0).click()
    await results.getByRole('checkbox').nth(1).click()
    await host.getByRole('button', { name: t('session.duo.create.submit', { count: 2 }) }).click()
    await expect(host).toHaveURL(/\/sessions\/[0-9A-HJKMNP-TV-Z]{6}$/)

    const sendLink = host.getByRole('heading', { name: t('session.duo.inviteTitle') })
    await expect(sendLink).toBeVisible()
    await expect(host.getByRole('button', { name: t('session.invite.copyLink') })).toBeVisible()
    await expect(host.getByTestId('invite-code')).toHaveCount(0)
    await expect(host.getByRole('group', { name: t('session.vote.group') })).toBeVisible()

    const sessionUrl = host.url()
    const code = sessionUrl.split('/').pop() as string

    // 3. Le lien, sans pseudo : onboarding, puis le deck directement
    await partner.goto(`/join/${code}`)
    await expect(partner).toHaveURL(/\/setup\?next=/)
    // L'aperçu anonyme existe tant qu'une place est libre : la règle s'annonce.
    await expect(partner.getByText(t('session.rules.lines.duo'))).toBeVisible()
    await partner.getByLabel(t('onboarding.pseudo.label')).fill('Sam')
    await partner.getByRole('button', { name: t('onboarding.pseudo.submitJoin') }).click()
    await expect(partner).toHaveURL(sessionUrl)
    await expect(partner.getByRole('group', { name: t('session.vote.group') })).toBeVisible()
    await expect(sendLink).toHaveCount(0, { timeout: 15_000 })

    // 4. Deux places, pas une de plus
    await third.goto(`/join/${code}`)
    // Duo complet : plus d'aperçu anonyme, l'onboarding est celui de tous.
    await third.getByLabel(t('onboarding.pseudo.label')).fill('Tiers')
    await third.getByRole('button', { name: t('onboarding.pseudo.submit') }).click()
    await expect(third.getByText(match('session.join.failed'))).toBeVisible()
    await expect(third.getByText(t('errors.codes.duo_full'))).toBeVisible()

    // 5. Premier resto : bof contre ça me va, pas d'accord
    await host.getByRole('button', { name: match('session.vote.actions.no') }).click()
    await partner.getByRole('button', { name: match('session.vote.actions.yes') }).click()
    await expect(host).toHaveURL(sessionUrl)

    // 6. Second resto : ça me va des deux côtés, c'est décidé
    await partner.getByRole('button', { name: match('session.vote.actions.yes') }).click()
    await host.getByRole('button', { name: match('session.vote.actions.yes') }).click()

    await expect(host).toHaveURL(/\/results$/, { timeout: 15_000 })
    await expect(partner).toHaveURL(/\/results$/, { timeout: 15_000 })
    const agreement = t('session.results.eyebrow.agreement')
    await expect(host.getByText(agreement)).toBeVisible()
    await expect(partner.getByText(agreement)).toBeVisible()
    await expect(host.getByText(t('session.results.rest'))).toHaveCount(0)
  })
})

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  return context.newPage()
}
