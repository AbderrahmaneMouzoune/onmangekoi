import { expect, test, type Browser, type Page } from '@playwright/test'

import { auditA11y } from './support/a11y'

/**
 * La liste partagée comme objet public (issue #57).
 *  1. Alex crée une liste de deux restos et la passe en publique.
 *  2. Quelqu'un sans pseudo ouvre `/l/<code>` : la page se présente — nom,
 *     adresses, cuisines — et ne porte nulle part le pseudo d'Alex.
 *  3. « Lancer une session depuis cette liste » l'envoie à l'onboarding et le
 *     ramène sur la liste, comme `/join/<code>`.
 *  4. Le deuxième clic ouvre la session, nommée d'après la liste.
 *  5. Repassée en privée, la page redemande un pseudo.
 */
test.describe('Liste publique', () => {
  test.skip(process.env.E2E !== '1', 'Nécessite une stack Supabase locale (E2E=1).')

  test('du partage public à la session', async ({ browser }, testInfo) => {
    const owner = await newPage(browser)
    const visitor = await newPage(browser)

    // 1. Alex : onboarding + création de la liste
    await owner.goto('/lists/new')
    await expect(owner).toHaveURL(/\/setup\?next=/)
    await owner.getByLabel('Ton pseudo').fill('Alex')
    await owner.getByRole('button', { name: /c’est parti/i }).click()
    await expect(owner).toHaveURL(/\/lists\/new$/)

    await owner.getByLabel('Nom de la liste').fill('Les restos du bureau')
    const results = owner.getByRole('list', { name: 'Résultats' })
    await results.getByRole('checkbox').nth(0).click()
    await results.getByRole('checkbox').nth(1).click()
    await owner.getByRole('button', { name: /enregistrer la liste · 2 restos/i }).click()

    // URL lisible : le code de partage, pas d'uuid
    await expect(owner).toHaveURL(/\/lists\/[0-9A-HJKMNP-TV-Z]{10}$/)
    const code = owner.url().split('/').at(-1) as string

    // 2. Le partage est opt-in : la liste naît privée
    await visitor.goto(`/l/${code}`)
    await expect(visitor).toHaveURL(new RegExp(`/setup\\?next=%2Fl%2F${code}`))

    await owner.getByRole('switch', { name: 'Privée' }).click()
    await expect(owner.getByRole('switch', { name: 'Publique' })).toBeVisible()

    // 3. Le visiteur sans pseudo voit la page — et rien d'Alex
    await visitor.goto(`/l/${code}`)
    await expect(visitor.getByRole('heading', { name: 'Les restos du bureau' })).toBeVisible()
    await expect(visitor.getByText('Liste publique')).toBeVisible()
    await expect(visitor.getByText('Alex')).toHaveCount(0)
    await auditA11y(visitor, testInfo, 'liste publique')

    // 4. Lancer une session : onboarding, retour à la liste, puis la session
    await visitor.getByRole('link', { name: /lancer une session/i }).click()
    await expect(visitor).toHaveURL(new RegExp(`/setup\\?next=%2Fl%2F${code}`))
    await visitor.getByLabel('Ton pseudo').fill('Sam')
    await visitor.getByRole('button', { name: /c’est parti/i }).click()
    await expect(visitor).toHaveURL(`/l/${code}`)

    await visitor.getByRole('button', { name: /lancer une session/i }).click()
    await expect(visitor).toHaveURL(/\/sessions\/[0-9A-HJKMNP-TV-Z]{6}$/)
    await expect(visitor.getByRole('heading', { name: 'Les restos du bureau' })).toBeVisible()
    await expect(visitor.getByText('2 restos à départager')).toBeVisible()

    // 5. Refermée d'un clic : la vitrine disparaît pour qui n'a pas de pseudo
    await owner.getByRole('switch', { name: 'Publique' }).click()
    await expect(owner.getByRole('switch', { name: 'Privée' })).toBeVisible()

    const passerby = await newPage(browser)
    await passerby.goto(`/l/${code}`)
    await expect(passerby).toHaveURL(new RegExp(`/setup\\?next=%2Fl%2F${code}`))
  })
})

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  return context.newPage()
}
