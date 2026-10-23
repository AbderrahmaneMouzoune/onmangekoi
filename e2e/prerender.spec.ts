import { expect, test } from '@playwright/test'

/**
 * Coquille prérendue de l'accueil : le contenu public (accroche, « comment ça
 * marche ») doit être dans le HTML servi, pas seulement dans le payload RSC.
 *
 * Avec `cacheComponents`, une seule lecture de l'heure (`Date.now()`) au rendu
 * d'un composant client suffit à sortir toute la page de la coquille : le
 * HTML ne porte plus que la silhouette de `loading.tsx` et le contenu
 * n'apparaît qu'après le téléchargement et l'hydratation du JavaScript — plus
 * d'une seconde de perdue sur téléphone. Rien ne le voit à l'œil sur une
 * machine rapide : ce test, si.
 */
test.describe('Prérendu', () => {
  test.skip(process.env.E2E !== '1', 'Nécessite une stack Supabase locale (E2E=1).')

  test('l’accueil sert son contenu dans le HTML', async ({ request }) => {
    const response = await request.get('/')
    expect(response.ok()).toBe(true)

    // Le payload RSC (scripts inline) contient le texte dans tous les cas :
    // seul le HTML hors scripts dit si la page a été prérendue.
    const html = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
    expect(html).toMatch(/<h1\b/)
    expect(html).toContain('id="how-title"')
  })
})
