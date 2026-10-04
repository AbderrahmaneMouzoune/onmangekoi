import { Bricolage_Grotesque, Geist_Mono, Instrument_Sans } from 'next/font/google'

import { cn } from '@/lib/utils'

/**
 * Polices du site, partagées par le layout racine (`[locale]/layout.tsx`) et
 * la page 404 globale (`global-not-found.tsx`), qui a son propre `<html>`.
 */
const fontDisplay = Bricolage_Grotesque({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-display',
  display: 'swap',
})

const fontSans = Instrument_Sans({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-sans',
  display: 'swap',
})

const fontMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const fontClassNames = cn(fontDisplay.variable, fontSans.variable, fontMono.variable)
