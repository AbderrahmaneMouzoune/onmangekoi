import { TIME_ZONE, type Locale } from '@/i18n/config'

/**
 * Petits helpers de formatage partagés (purs, testés).
 *
 * Les nombres et les dates se formatent dans la langue de l'interface, qu'on
 * passe explicitement : `useLocale()` dans un composant (serveur synchrone ou
 * client), `await getLocale()` dans un composant serveur asynchrone. Les
 * pluriels, eux, ne se fabriquent plus ici : ce sont des messages ICU
 * (`common.counts.restaurants` : `{count, plural, one {# resto} other {# restos}}`),
 * que `t('…', { count })` accorde selon les règles de chaque langue.
 *
 * `plural` et `countLabel` restent le temps que les phases B et C de l'issue
 * #14 extraient les derniers composants (voir `docs/i18n.md`) : ils ne savent
 * que le français.
 */

/** @deprecated Français seulement : utiliser un message ICU `{count, plural, …}`. */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count > 1 ? pluralForm : singular
}

/** @deprecated Français seulement : utiliser un message ICU `{count, plural, …}` (`common.counts`). */
export function countLabel(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${plural(count, singular, pluralForm)}`
}

export function initials(name: string | null | undefined, fallback = '?'): string {
  const clean = (name ?? '').trim()
  if (!clean) return fallback
  const parts = clean.split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? ''
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + second).toUpperCase() || fallback
}

/**
 * Libellés de repli des pseudos, traduits par l'appelant
 * (`t('common.people.guest')`, `t('common.people.deletedParticipant')`).
 * Le français par défaut disparaîtra avec la phase C de l'issue #14.
 */
export interface PeopleLabels {
  guest: string
  deletedParticipant: string
}

export const FRENCH_PEOPLE_LABELS: PeopleLabels = {
  guest: 'Invité',
  deletedParticipant: 'Participant supprimé',
}

/** Libellé d'un participant dont le compte a été supprimé (RGPD). */
export const DELETED_PARTICIPANT = FRENCH_PEOPLE_LABELS.deletedParticipant

export function displayPseudo(
  pseudo: string | null | undefined,
  guest: string = FRENCH_PEOPLE_LABELS.guest
): string {
  const clean = (pseudo ?? '').trim()
  return clean || guest
}

/**
 * Nom affiché d'un participant. Un `profileId` null signale un compte
 * supprimé : la ligne survit pour que son vote reste dans le classement, mais
 * son auteur n'existe plus — il ne faut surtout pas le confondre avec un
 * invité sans pseudo.
 */
export function participantLabel(
  profileId: string | null,
  pseudo: string | null | undefined,
  labels: PeopleLabels = FRENCH_PEOPLE_LABELS
): string {
  return profileId === null ? labels.deletedParticipant : displayPseudo(pseudo, labels.guest)
}

/** Un formateur `Intl` par langue et par jeu d'options : leur construction coûte. */
function memoized<T>(build: (locale: Locale) => T): (locale: Locale) => T {
  const cache = new Map<Locale, T>()
  return (locale) => {
    let formatter = cache.get(locale)
    if (!formatter) {
      formatter = build(locale)
      cache.set(locale, formatter)
    }
    return formatter
  }
}

const percentFormatter = memoized(
  (locale) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 })
)

/** `0.42` → `42 %` en français, `42%` en anglais. Le ratio est attendu entre 0 et 1. */
export function percentLabel(ratio: number, locale: Locale): string {
  return percentFormatter(locale).format(ratio)
}

const relativeFormatter = memoized(
  (locale) => new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
)

const shortDateFormatter = memoized(
  (locale) =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: TIME_ZONE })
)

/** « il y a 5 minutes », « avant-hier », puis une date courte au-delà d'un mois. */
export function relativeDate(iso: string, locale: Locale, now: Date = new Date()): string {
  const date = new Date(iso)
  const relative = relativeFormatter(locale)
  const diffMs = date.getTime() - now.getTime()
  const diffMinutes = Math.round(diffMs / 60_000)
  if (Math.abs(diffMinutes) < 60) return relative.format(diffMinutes, 'minute')
  const diffHours = Math.round(diffMinutes / 60)
  if (Math.abs(diffHours) < 24) return relative.format(diffHours, 'hour')
  const diffDays = Math.round(diffHours / 24)
  if (Math.abs(diffDays) < 30) return relative.format(diffDays, 'day')
  return shortDateFormatter(locale).format(date)
}
