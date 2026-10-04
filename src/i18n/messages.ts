import enAccount from '../../messages/en/account.json'
import enChangelog from '../../messages/en/changelog.json'
import enCommon from '../../messages/en/common.json'
import enErrors from '../../messages/en/errors.json'
import enGroups from '../../messages/en/groups.json'
import enHome from '../../messages/en/home.json'
import enLayout from '../../messages/en/layout.json'
import enLegal from '../../messages/en/legal.json'
import enLists from '../../messages/en/lists.json'
import enMetadata from '../../messages/en/metadata.json'
import enOg from '../../messages/en/og.json'
import enOnboarding from '../../messages/en/onboarding.json'
import enPwa from '../../messages/en/pwa.json'
import enRestaurants from '../../messages/en/restaurants.json'
import enSession from '../../messages/en/session.json'
import frAccount from '../../messages/fr/account.json'
import frChangelog from '../../messages/fr/changelog.json'
import frCommon from '../../messages/fr/common.json'
import frErrors from '../../messages/fr/errors.json'
import frGroups from '../../messages/fr/groups.json'
import frHome from '../../messages/fr/home.json'
import frLayout from '../../messages/fr/layout.json'
import frLegal from '../../messages/fr/legal.json'
import frLists from '../../messages/fr/lists.json'
import frMetadata from '../../messages/fr/metadata.json'
import frOg from '../../messages/fr/og.json'
import frOnboarding from '../../messages/fr/onboarding.json'
import frPwa from '../../messages/fr/pwa.json'
import frRestaurants from '../../messages/fr/restaurants.json'
import frSession from '../../messages/fr/session.json'

import type { Locale } from './config'

/**
 * Catalogue des messages, un fichier JSON par espace de noms et par langue
 * (`messages/<langue>/<espace>.json`). Le découpage permet de traduire un
 * domaine sans toucher aux fichiers des autres.
 *
 * Le français fait foi : c'est sa forme qui type `t('…')` (voir
 * `src/i18n/next-intl.d.ts`), et `messages.test.ts` vérifie que l'anglais a
 * exactement les mêmes clés et les mêmes arguments.
 *
 * Ajouter un espace de noms : créer les deux fichiers, puis l'importer ici
 * dans les deux catalogues.
 */
export const FR_MESSAGES = {
  account: frAccount,
  changelog: frChangelog,
  common: frCommon,
  errors: frErrors,
  groups: frGroups,
  home: frHome,
  layout: frLayout,
  legal: frLegal,
  lists: frLists,
  metadata: frMetadata,
  og: frOg,
  onboarding: frOnboarding,
  pwa: frPwa,
  restaurants: frRestaurants,
  session: frSession,
}

export type AppMessages = typeof FR_MESSAGES

/**
 * Typé comme le français : une clé manquante en anglais est une erreur de
 * compilation. Les clés en trop et les arguments ICU divergents, eux, ne se
 * voient qu'au test de parité (`messages.test.ts`).
 */
const EN_MESSAGES: AppMessages = {
  account: enAccount,
  changelog: enChangelog,
  common: enCommon,
  errors: enErrors,
  groups: enGroups,
  home: enHome,
  layout: enLayout,
  legal: enLegal,
  lists: enLists,
  metadata: enMetadata,
  og: enOg,
  onboarding: enOnboarding,
  pwa: enPwa,
  restaurants: enRestaurants,
  session: enSession,
}

export const MESSAGES: Record<Locale, AppMessages> = {
  fr: FR_MESSAGES,
  en: EN_MESSAGES,
}
