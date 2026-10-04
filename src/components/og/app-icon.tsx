/**
 * Icône de l'app : une ardoise sombre, un « k » à la craie, un point tomate.
 * Rendue par Satori (`ImageResponse`) : styles inline uniquement, flex explicite.
 *
 * Toutes les cotes sont celles de l'icône 512 px d'origine, ramenées à la
 * taille demandée — l'icône d'onglet, celle d'Apple et celles du manifest
 * sont ainsi le même dessin.
 *
 * `glyph` est la part du carré occupée par le dessin. Une icône « maskable »
 * est rognée par le système (cercle, squircle, goutte…) : seul le disque
 * central de 80 % du côté est garanti visible. On la dessine donc à fond
 * perdu, sans coins arrondis, avec un glyphe réduit à 80 % — le point tomate,
 * le plus excentré, reste alors dans la zone de sécurité (test dans
 * `src/lib/pwa/icons.test.ts`).
 */

import { ImageResponse } from 'next/og'

import { ICON_BASE, ICON_GEOMETRY, MASKABLE_GLYPH } from '@/lib/pwa/icons'

import type { PwaIconPurpose } from '@/lib/pwa/icons'

/** Le « k » de « koi » : un dessin, pas un mot — il ne se traduit pas. */
const GLYPH = 'k'

interface AppIconProps {
  /** Côté de l'image, en pixels. */
  size: number
  /** Coins arrondis (icône d'onglet) ou carré plein (Apple, maskable). */
  rounded?: boolean
  /** Part du côté occupée par le dessin : 1 pour les icônes classiques, 0.8 pour maskable. */
  glyph?: number
}

export function AppIcon({ size, rounded = false, glyph = 1 }: AppIconProps) {
  const inner = size * glyph
  const unit = inner / ICON_BASE
  const { fontSize, letterSpacing, marginTop, dot, radius } = ICON_GEOMETRY

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#24282c',
        borderRadius: rounded ? (radius * size) / ICON_BASE : 0,
      }}
    >
      <div
        style={{
          width: inner,
          height: inner,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <span
          style={{
            fontSize: fontSize * unit,
            fontWeight: 800,
            color: '#f3f0e7',
            letterSpacing: letterSpacing * unit,
            lineHeight: 1,
            marginTop: marginTop * unit,
          }}
        >
          {GLYPH}
        </span>
        <span
          style={{
            position: 'absolute',
            right: dot.right * unit,
            bottom: dot.bottom * unit,
            width: dot.size * unit,
            height: dot.size * unit,
            borderRadius: (dot.size * unit) / 2,
            background: '#e8412c',
          }}
        />
      </div>
    </div>
  )
}

/** Réponse PNG d'une icône du manifest (routes de `src/app/icons/`). */
export function pwaIconResponse(size: number, purpose: PwaIconPurpose): ImageResponse {
  const icon =
    purpose === 'maskable' ? (
      <AppIcon size={size} glyph={MASKABLE_GLYPH} />
    ) : (
      <AppIcon size={size} rounded />
    )
  return new ImageResponse(icon, { width: size, height: size })
}
