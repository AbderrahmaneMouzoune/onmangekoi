import { expect, test } from './support/i18n'

import type { Browser, Page } from '@playwright/test'

/**
 * Session ouverte (issue #58) : pas de salle d'attente, chacun vote à son
 * heure.
 *  1. Cocher « Session ouverte » retire « Sans limite » : l'échéance devient
 *     obligatoire.
 *  2. Le host arrive directement sur le deck, l'invitation dépliée au-dessus.
 *  3. Il vote tout : la session reste ouverte, personne n'est « attendu ».
 *  4. L'invité rejoint **pendant** le vote et vote sur les mêmes cartes.
 *  5. Le host clôture à la main : tout le monde passe au classement.
 */
test.describe('Session ouverte', () => {
  test.skip(process.env.E2E !== '1', 'Nécessite une stack Supabase locale (E2E=1).')

  test('voter chacun à son heure', async ({ browser, i18n: { t, match } }) => {
    const host = await newPage(browser)
    const guest = await newPage(browser)

    // 1. Une session ouverte, à deux restaurants
    await host.goto('/sessions/new')
    await host.getByLabel(t('onboarding.pseudo.label')).fill('Alex')
    await host.getByRole('button', { name: t('onboarding.pseudo.submit') }).click()
    await host.getByLabel(t('session.create.steps.name')).fill('E2E ouverte')
    const results = host.getByRole('list', { name: t('restaurants.catalog.label') })
    await results.getByRole('checkbox').nth(0).click()
    await results.getByRole('checkbox').nth(1).click()

    const noLimit = host.getByRole('radio', { name: t('session.deadline.none') })
    await expect(noLimit).toBeChecked()
    await host.getByRole('checkbox', { name: match('session.open.label') }).click()
    await expect(noLimit).toHaveCount(0)
    await expect(
      host.getByRole('radio', { name: t('session.deadline.inHours', { hours: 1 }), exact: true })
    ).toBeChecked()

    await host.getByRole('button', { name: t('session.create.submit', { count: 2 }) }).click()
    await expect(host).toHaveURL(/\/sessions\/[0-9A-HJKMNP-TV-Z]{6}$/)

    // 2. Pas de salle d'attente : le deck, et l'invitation au-dessus
    await expect(host.getByRole('button', { name: t('session.waiting.launch') })).toHaveCount(0)
    await expect(host.getByRole('group', { name: t('session.vote.group') })).toBeVisible()
    // La pastille des règles, texte exact : le résumé du formulaire de création
    // (« Session ouverte : chacun vote à son heure · 1 coup de cœur · … ») peut
    // encore être dans le DOM pendant la redirection, et une recherche par
    // sous-chaîne le trouverait aussi.
    await expect(
      host
        .getByRole('list', { name: t('session.rules.label') })
        .getByText(t('session.rules.lines.open'), { exact: true })
    ).toBeVisible()
    const code = await host.getByTestId('invite-code').getAttribute('data-code')
    const sessionUrl = host.url()

    // 3. Le host vote tout : la session reste ouverte
    await host.getByRole('button', { name: match('session.vote.actions.yes') }).click()
    await host.getByRole('button', { name: match('session.vote.actions.no') }).click()
    const stillOpen = t('session.finished.open')
    await expect(host.getByText(stillOpen)).toBeVisible()
    await expect(host).toHaveURL(sessionUrl)

    // 4. L'invité arrive pendant le vote
    await guest.goto('/join')
    await guest.getByLabel(t('onboarding.pseudo.label')).fill('Sam')
    await guest.getByRole('button', { name: t('onboarding.pseudo.submit') }).click()
    await guest.getByLabel(t('session.join.label')).fill(code as string)
    await guest.getByRole('button', { name: t('common.actions.join') }).click()
    await expect(guest).toHaveURL(sessionUrl)
    await expect(guest.getByRole('group', { name: t('session.vote.group') })).toBeVisible()
    await guest.getByRole('button', { name: match('session.vote.actions.yes') }).click()
    await guest.getByRole('button', { name: match('session.vote.actions.yes') }).click()

    // 5. Tout le monde a voté, mais seule l'échéance ou le host ferment
    await expect(guest.getByText(stillOpen)).toBeVisible()
    await host.getByRole('button', { name: t('session.finished.closeNow') }).click()
    await host.getByRole('button', { name: t('session.finished.confirmClose') }).click()

    await expect(host).toHaveURL(/\/results$/, { timeout: 15_000 })
    await expect(guest).toHaveURL(/\/results$/, { timeout: 15_000 })
  })
})

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  return context.newPage()
}
