import { Bricolage_Grotesque, Geist_Mono, Instrument_Sans } from 'next/font/google'

import { cn } from '@/lib/utils'

/**
 * Polices du site, partagées par le layout racine (`[locale]/layout.tsx`) et
 * la page 404 globale (`global-not-found.tsx`), qui a son propre `<html>`.
 *
 * `subsets` ne règle que le *préchargement* : les autres sous-ensembles
 * restent déclarés (`unicode-range`) et le navigateur ne les télécharge que si
 * la page contient un de leurs caractères — un nom de restaurant en polonais,
 * par exemple. Le français et l'anglais tiennent dans `latin`, d'où un seul
 * fichier préchargé par famille. La mono ne sert qu'à de petits repères : elle
 * arrive sans précharge, la police de secours tient sa place en attendant.
 */
const fontDisplay = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

const fontSans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const fontMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  preload: false,
})

export const fontClassNames = cn(fontDisplay.variable, fontSans.variable, fontMono.variable)
