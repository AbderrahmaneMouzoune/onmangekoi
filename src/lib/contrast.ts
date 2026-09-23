/**
 * Contraste WCAG 2.1 : luminance relative et rapport entre deux couleurs.
 *
 * Sert au test qui garde la charte « L'ardoise » lisible dans les deux thèmes
 * (`src/app/theme-contrast.test.ts`). Les seuils de référence : 4.5:1 pour du
 * texte courant, 3:1 pour du texte large et pour tout ce qui n'est pas du
 * texte (icône décorative, anneau de focus, bordure porteuse de sens).
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

/** `#abc`, `#aabbcc` et `#aabbccff` — les formes employées par les tokens. */
export function parseHexColor(value: string): Rgb | null {
  const hex = value.trim().replace(/^#/, '')
  const full =
    hex.length === 3 || hex.length === 4
      ? hex
          .slice(0, 3)
          .split('')
          .map((char) => char + char)
          .join('')
      : hex.length === 6 || hex.length === 8
        ? hex.slice(0, 6)
        : null
  if (full === null || !/^[0-9a-f]{6}$/i.test(full)) return null
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

/** Luminance relative, canal par canal (WCAG 2.1, §relative luminance). */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const [rl, gl, bl] = [r, g, b].map((channel) => {
    const ratio = channel / 255
    return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl
}

/**
 * Rapport de contraste entre deux couleurs, de 1 (identiques) à 21
 * (noir sur blanc). L'ordre des arguments n'a pas d'importance.
 */
export function contrastRatio(a: string, b: string): number {
  const first = parseHexColor(a)
  const second = parseHexColor(b)
  if (!first || !second) {
    throw new Error(`Couleur illisible : ${!first ? a : b}`)
  }
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (x, y) => y - x
  )
  return (lighter + 0.05) / (darker + 0.05)
}
