/** Petits helpers de formatage partagés (purs, testés). */

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count > 1 ? pluralForm : singular
}

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

export function displayPseudo(pseudo: string | null | undefined): string {
  const clean = (pseudo ?? '').trim()
  return clean || 'Invité'
}

const relativeFormatter = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })

export function relativeDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  const diffMs = date.getTime() - now.getTime()
  const diffMinutes = Math.round(diffMs / 60_000)
  if (Math.abs(diffMinutes) < 60) return relativeFormatter.format(diffMinutes, 'minute')
  const diffHours = Math.round(diffMinutes / 60)
  if (Math.abs(diffHours) < 24) return relativeFormatter.format(diffHours, 'hour')
  const diffDays = Math.round(diffHours / 24)
  if (Math.abs(diffDays) < 30) return relativeFormatter.format(diffDays, 'day')
  return new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'short' }).format(date)
}
