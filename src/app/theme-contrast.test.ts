import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { contrastRatio } from '@/lib/contrast'

/**
 * Garde-fou de la charte « L'ardoise » : les tokens de `globals.css` sont lus
 * ici, tels quels, et chaque paire réellement posée dans l'interface doit
 * tenir son seuil WCAG — dans le thème clair comme dans le sombre.
 *
 * Retoucher une teinte sans repasser par ce test, c'est risquer un texte
 * illisible que l'audit axe ne verra que sur les pages qu'il visite.
 */

const CSS = readFileSync(path.join(import.meta.dirname, 'globals.css'), 'utf8')

/** Texte courant : 4.5:1 (WCAG 2.1 AA, 1.4.3). */
const TEXT_MIN = 4.5
/** Icônes, anneau de focus, aplats : 3:1 (WCAG 2.1 AA, 1.4.11). */
const NON_TEXT_MIN = 3

interface Pair {
  fg: string
  bg: string
  /** Où la paire apparaît — pour que l'échec dise quoi regarder. */
  usage: string
}

const TEXT_PAIRS: Pair[] = [
  { fg: 'ink', bg: 'bg', usage: 'corps de page' },
  { fg: 'ink', bg: 'surface', usage: 'texte de carte' },
  { fg: 'ink', bg: 'surface-2', usage: 'bouton secondaire' },
  { fg: 'ink-2', bg: 'bg', usage: 'paragraphe secondaire' },
  { fg: 'ink-2', bg: 'surface', usage: 'paragraphe de carte' },
  { fg: 'ink-2', bg: 'surface-2', usage: 'badge par défaut' },
  { fg: 'ink-muted', bg: 'bg', usage: 'muted-foreground sur la page' },
  { fg: 'ink-muted', bg: 'surface', usage: 'description de carte, placeholder' },
  { fg: 'ink-muted', bg: 'surface-2', usage: 'méta sur fond secondaire' },
  { fg: 'brand', bg: 'bg', usage: 'lien et accent sur la page' },
  { fg: 'brand', bg: 'surface', usage: 'lien dans une carte' },
  { fg: 'on-brand', bg: 'brand', usage: 'bouton principal' },
  { fg: 'brand-hover', bg: 'brand-soft', usage: 'badge « brand », accent shadcn' },
  { fg: 'chalk', bg: 'slate', usage: 'titre de la carte de vote' },
  { fg: 'chalk', bg: 'slate-2', usage: 'ardoise éclaircie' },
  { fg: 'chalk-muted', bg: 'slate', usage: 'adresse et compteur de la carte' },
  { fg: 'chalk-muted', bg: 'slate-2', usage: 'méta sur ardoise éclaircie' },
  { fg: 'slate', bg: 'chalk', usage: 'bouton « chalk » sur l’ardoise' },
  { fg: 'v-veto', bg: 'v-veto-soft', usage: 'bouton Veto au repos' },
  { fg: 'v-no', bg: 'v-no-soft', usage: 'bouton Bof au repos' },
  { fg: 'v-yes', bg: 'v-yes-soft', usage: 'bouton Ça me va au repos' },
  { fg: 'v-fav', bg: 'v-fav-soft', usage: 'bouton Coup de cœur au repos' },
  { fg: 'v-veto', bg: 'bg', usage: 'score négatif du classement' },
  { fg: 'v-no', bg: 'bg', usage: 'compteur « bof » du classement' },
  { fg: 'v-yes', bg: 'bg', usage: 'score positif du classement' },
  { fg: 'v-fav', bg: 'bg', usage: 'compteur de coups de cœur' },
  { fg: 'v-veto', bg: 'surface', usage: 'ligne de classement' },
  { fg: 'v-no', bg: 'surface', usage: 'ligne de classement' },
  { fg: 'v-yes', bg: 'surface', usage: 'ligne de classement' },
  { fg: 'v-fav', bg: 'surface', usage: 'ligne de classement' },
  // Survol des boutons de vote : l'aplat prend la couleur, le texte s'inverse.
  { fg: 'surface', bg: 'v-veto', usage: 'bouton Veto survolé' },
  { fg: 'surface', bg: 'v-no', usage: 'bouton Bof survolé' },
  { fg: 'surface', bg: 'v-yes', usage: 'bouton Ça me va survolé' },
  { fg: 'surface', bg: 'v-fav', usage: 'bouton Coup de cœur survolé' },
]

const NON_TEXT_PAIRS: Pair[] = [
  { fg: 'faint', bg: 'bg', usage: 'icône d’état vide' },
  { fg: 'faint', bg: 'surface', usage: 'icône dans une carte' },
  { fg: 'focus', bg: 'bg', usage: 'anneau de focus sur la page' },
  { fg: 'focus', bg: 'surface', usage: 'anneau de focus dans une carte' },
  { fg: 'focus', bg: 'surface-2', usage: 'anneau de focus sur fond secondaire' },
]

/**
 * Les tokens vivent dans deux blocs plats, avant `@theme inline`. Le bloc
 * groupé `:root, .dark` (alias shadcn) ne contient que des `var()` : on le
 * laisse de côté en n'acceptant que les sélecteurs exacts.
 */
function tokensOf(selector: string): Record<string, string> {
  const head = CSS.slice(0, CSS.indexOf('@theme inline')).replace(/\/\*[\s\S]*?\*\//g, '')
  const blocks = [...head.matchAll(/([^{}]*)\{([^{}]*)\}/g)]
  const block = blocks.find(([, found]) => normalizeSelector(found) === selector)
  if (!block) throw new Error(`Bloc ${selector} introuvable dans globals.css`)
  const tokens: Record<string, string> = {}
  for (const [, name, value] of block[2].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    tokens[name] = value
  }
  return tokens
}

/** Ne garder que le sélecteur : ce qui suit la dernière règle à `;`. */
function normalizeSelector(raw: string): string {
  return raw
    .slice(raw.lastIndexOf(';') + 1)
    .replace(/\s+/g, ' ')
    .trim()
}

const light = tokensOf(':root')
const dark = { ...light, ...tokensOf('.dark') }

const THEMES = [
  { name: 'clair', tokens: light },
  { name: 'sombre', tokens: dark },
] as const

describe('Charte « L’ardoise » : contraste des tokens', () => {
  it('should expose every token both themes use', () => {
    const used = [...TEXT_PAIRS, ...NON_TEXT_PAIRS].flatMap((pair) => [pair.fg, pair.bg])
    for (const { name, tokens } of THEMES) {
      const missing = [...new Set(used)].filter((token) => !tokens[token])
      expect(missing, `tokens absents du thème ${name}`).toEqual([])
    }
  })

  for (const { name, tokens } of THEMES) {
    describe(`thème ${name}`, () => {
      it.each(TEXT_PAIRS)(`should keep --$fg on --$bg readable ($usage)`, ({ fg, bg, usage }) => {
        const ratio = contrastRatio(tokens[fg], tokens[bg])
        expect(
          Number(ratio.toFixed(2)),
          `--${fg} (${tokens[fg]}) sur --${bg} (${tokens[bg]}) — ${usage}`
        ).toBeGreaterThanOrEqual(TEXT_MIN)
      })

      it.each(NON_TEXT_PAIRS)(
        `should keep --$fg on --$bg perceivable ($usage)`,
        ({ fg, bg, usage }) => {
          const ratio = contrastRatio(tokens[fg], tokens[bg])
          expect(
            Number(ratio.toFixed(2)),
            `--${fg} (${tokens[fg]}) sur --${bg} (${tokens[bg]}) — ${usage}`
          ).toBeGreaterThanOrEqual(NON_TEXT_MIN)
        }
      )
    })
  }
})
