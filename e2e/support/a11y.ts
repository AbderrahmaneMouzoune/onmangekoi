import { AxeBuilder } from '@axe-core/playwright'
import { expect } from '@playwright/test'

import type { Page, TestInfo } from '@playwright/test'
import type { Result } from 'axe-core'

/**
 * Audit axe d'une page, dans l'état où le test l'a laissée.
 *
 * On ne retient que les normes WCAG (les règles « best-practice » d'axe sont
 * des conseils, pas des critères) et on n'échoue que sur `serious` et
 * `critical` : ce sont les violations qui empêchent réellement quelqu'un
 * d'utiliser la page. Le rapport complet part en pièce jointe du test, y
 * compris les violations mineures, pour qu'un échec se diagnostique sans
 * rejouer le parcours.
 */

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const BLOCKING = new Set(['serious', 'critical'])

export async function auditA11y(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()

  if (violations.length > 0) {
    await testInfo.attach(`axe-${slug(name)}.json`, {
      body: JSON.stringify(violations, null, 2),
      contentType: 'application/json',
    })
  }

  const blocking = violations.filter((violation) => BLOCKING.has(violation.impact ?? ''))
  expect(blocking.map(summarize), `Violations axe bloquantes sur « ${name} »`).toEqual([])
}

/** Une ligne par violation : la règle, son impact, et où regarder. */
function summarize(violation: Result): string {
  const targets = violation.nodes
    .slice(0, 3)
    .map((node) => node.target.join(' '))
    .join(', ')
  return `${violation.id} (${violation.impact}) — ${violation.help} → ${targets}`
}

function slug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase()
}

interface FocusState {
  label: string
  focusVisible: boolean
  outlined: boolean
}

/**
 * Parcourt la page à la tabulation et vérifie que chaque arrêt se voit :
 * `:focus-visible` doit matcher, et l'élément doit porter un contour ou un
 * anneau (les deux formes employées dans la charte).
 */
export async function expectVisibleFocusRing(page: Page, steps: number): Promise<void> {
  for (let step = 0; step < steps; step += 1) {
    await page.keyboard.press('Tab')
    const state = await page.evaluate<FocusState | null>(() => {
      const element = document.activeElement
      if (!element || element === document.body) return null
      const style = getComputedStyle(element)
      const text = element.textContent?.trim().slice(0, 40) ?? ''
      const name = element.getAttribute('aria-label') ?? text
      return {
        label: `<${element.tagName.toLowerCase()}> ${name}`,
        focusVisible: element.matches(':focus-visible'),
        outlined: style.outlineStyle !== 'none' || style.boxShadow !== 'none',
      }
    })
    if (!state) continue
    expect(state.focusVisible, `${state.label} ne déclenche pas :focus-visible`).toBe(true)
    expect(state.outlined, `${state.label} n'affiche aucun indicateur de focus`).toBe(true)
  }
}

/**
 * Bascule le thème comme le ferait le système. `next-themes` écoute la media
 * query : la classe `dark` suit sans rechargement.
 */
export async function useDarkTheme(page: Page): Promise<void> {
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveClass(/dark/)
}
