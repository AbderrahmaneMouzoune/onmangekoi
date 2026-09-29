import { expect, test } from '@playwright/test'

/**
 * Sélection proposée à la création (issue #59).
 *  1. Première visite, aucun historique : le panier est vide, aucun bandeau.
 *  2. Une session plus tard, la page s'ouvre sur ses deux restos, cochés,
 *     plus un jamais proposé — et une phrase dit d'où ils viennent.
 *  3. « Repartir de zéro » décoche la proposition d'un bloc.
 */
test.describe('Sélection proposée', () => {
  test.skip(process.env.E2E !== '1', 'Nécessite une stack Supabase locale (E2E=1).')

  test('partir d’une proposition plutôt que d’une page blanche', async ({ page }) => {
    // 1. Pas d'historique : la page d'avant
    await page.goto('/sessions/new')
    await page.getByLabel('Ton pseudo').fill('Alex')
    await page.getByRole('button', { name: /c’est parti/i }).click()
    await expect(page).toHaveURL(/\/sessions\/new$/)

    const notice = page.getByRole('complementary', { name: 'Sélection proposée' })
    await expect(notice).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Sélectionne des restaurants' })).toBeDisabled()

    await page.getByLabel('Nom de la session').fill('E2E première')
    const results = page.getByRole('list', { name: 'Résultats' })
    await results.getByRole('checkbox').nth(0).click()
    await results.getByRole('checkbox').nth(1).click()
    await page.getByRole('button', { name: /créer la session · 2 restos/i }).click()
    await expect(page).toHaveURL(/\/sessions\/[0-9A-HJKMNP-TV-Z]{6}$/)

    // 2. Retour à la création : les deux restos vus, plus un jamais proposé
    await page.goto('/sessions/new')
    await expect(notice).toBeVisible()
    await expect(notice).toContainText('Vus récemment')
    await expect(notice).toContainText('plus un jamais proposé')
    await expect(page.getByRole('button', { name: /créer la session · 3 restos/i })).toBeEnabled()

    // 3. Tout se décoche d'un bloc
    await notice.getByRole('button', { name: 'Repartir de zéro' }).click()
    await expect(notice).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Sélectionne des restaurants' })).toBeDisabled()
  })
})
