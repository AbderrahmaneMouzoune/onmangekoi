import { expect, test } from './support/i18n'

/**
 * Sélection proposée à la création (issue #59).
 *  1. Première visite, aucun historique : le panier est vide, aucun bandeau.
 *  2. Une session plus tard, la page s'ouvre sur ses deux restos, cochés,
 *     plus un jamais proposé — et une phrase dit d'où ils viennent.
 *  3. « Repartir de zéro » décoche la proposition d'un bloc.
 */
test.describe('Sélection proposée', () => {
  test.skip(process.env.E2E !== '1', 'Nécessite une stack Supabase locale (E2E=1).')

  test('partir d’une proposition plutôt que d’une page blanche', async ({ page, i18n: { t } }) => {
    // 1. Pas d'historique : la page d'avant
    await page.goto('/sessions/new')
    await page.getByLabel(t('onboarding.pseudo.label')).fill('Alex')
    await page.getByRole('button', { name: t('onboarding.pseudo.submit') }).click()
    await expect(page).toHaveURL(/\/sessions\/new$/)

    const notice = page.getByRole('complementary', { name: t('session.suggestion.label') })
    const empty = page.getByRole('button', { name: t('session.create.selectRestaurants') })
    await expect(notice).toHaveCount(0)
    await expect(empty).toBeDisabled()

    await page.getByLabel(t('session.create.steps.name')).fill('E2E première')
    const results = page.getByRole('list', { name: t('restaurants.catalog.label') })
    await results.getByRole('checkbox').nth(0).click()
    await results.getByRole('checkbox').nth(1).click()
    await page.getByRole('button', { name: t('session.create.submit', { count: 2 }) }).click()
    await expect(page).toHaveURL(/\/sessions\/[0-9A-HJKMNP-TV-Z]{6}$/)

    // 2. Retour à la création : les deux restos vus, plus un jamais proposé.
    // La phrase est un seul message ICU ; on en isole les deux morceaux en le
    // formatant avec et sans le resto frais, dont on ignore l'origine.
    const summary = (fresh: string) =>
      t('session.suggestion.summary', { recent: 2, winners: 0, days: 0, fresh })
    const seen = summary('none').replace(/\.$/, '')
    const fresh = summary('catalog').slice(seen.length).split(',')[0] as string
    await page.goto('/sessions/new')
    await expect(notice).toBeVisible()
    await expect(notice).toContainText(seen)
    await expect(notice).toContainText(fresh.trim())
    await expect(
      page.getByRole('button', { name: t('session.create.submit', { count: 3 }) })
    ).toBeEnabled()

    // 3. Tout se décoche d'un bloc
    await notice.getByRole('button', { name: t('session.suggestion.reset') }).click()
    await expect(notice).toHaveCount(0)
    await expect(empty).toBeDisabled()
  })
})
