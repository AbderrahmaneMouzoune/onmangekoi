/**
 * Icônes déclarées dans le manifest, et précachées par le service worker.
 *
 * Deux familles :
 *  - `any` : l'icône telle quelle, coins arrondis compris — onglet, bureau ;
 *  - `maskable` : à fond perdu, que le système découpe à sa forme (Android
 *    l'exige pour une icône d'écran d'accueil sans liseré blanc).
 *
 * `/icon` est l'icône 512 générée par `src/app/icon.tsx` ; les autres sont
 * servies par les routes de `src/app/icons/`.
 */

export type PwaIconPurpose = 'any' | 'maskable'

export interface PwaIcon {
  src: string
  size: number
  purpose: PwaIconPurpose
}

export const PWA_ICONS: readonly PwaIcon[] = [
  { src: '/icons/icon-192.png', size: 192, purpose: 'any' },
  { src: '/icon', size: 512, purpose: 'any' },
  { src: '/icons/maskable-192.png', size: 192, purpose: 'maskable' },
  { src: '/icons/maskable-512.png', size: 512, purpose: 'maskable' },
]

/** Côté de référence des cotes de `ICON_GEOMETRY`. */
export const ICON_BASE = 512

/** Cotes du dessin, en pixels sur une icône de `ICON_BASE` (voir `components/og/app-icon.tsx`). */
export const ICON_GEOMETRY = {
  fontSize: 340,
  letterSpacing: -20,
  marginTop: -20,
  dot: { right: 92, bottom: 108, size: 72 },
  radius: 112,
} as const

/**
 * Part du côté occupée par le dessin sur une icône maskable. La spécification
 * ne garantit visible que le disque central de rayon 40 % du côté.
 */
export const MASKABLE_GLYPH = 0.8

/** Rayon de la zone de sécurité d'une icône maskable, en part du côté. */
export const MASKABLE_SAFE_RADIUS = 0.4

/**
 * Distance au centre du point le plus excentré du dessin (le bord extérieur
 * du point tomate), en part du côté, pour un glyphe réduit à `glyph`.
 */
export function outermostReach(glyph: number): number {
  const { dot } = ICON_GEOMETRY
  const radius = dot.size / 2
  const centerX = ICON_BASE - dot.right - radius
  const centerY = ICON_BASE - dot.bottom - radius
  const dx = centerX - ICON_BASE / 2
  const dy = centerY - ICON_BASE / 2
  return ((Math.hypot(dx, dy) + radius) * glyph) / ICON_BASE
}
