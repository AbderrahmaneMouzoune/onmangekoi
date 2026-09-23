/**
 * Échéance de clôture d'une session : résolution du choix fait à la création,
 * lecture du temps restant, attribution de la clôture. Tout est pur — la base
 * rejoue les mêmes bornes (`public.assert_valid_deadline`), elle reste la
 * source de vérité ; ces fonctions servent l'interface.
 */

/** La base refuse une échéance à moins d'une minute. */
export const DEADLINE_MIN_MINUTES = 1
/** Au-delà, ce n'est plus un chronomètre : 12 heures, comme en base. */
export const DEADLINE_MAX_MINUTES = 12 * 60
/** Ce que le host ajoute d'un clic quand l'échéance approche. */
export const EXTEND_MINUTES = 5

/** Durées proposées au formulaire de création, en minutes. */
export const DEADLINE_PRESETS = [10, 20, 30, 60] as const

const MS_PER_MINUTE = 60_000

/** Qui a mis fin à la session. */
export type SessionCloseReason = 'host' | 'auto' | 'deadline'

/** Ce que le formulaire de création transmet : une durée ou un instant. */
export interface DeadlineInput {
  /** « dans 10 min » — résolu au moment de l'appel, sur l'horloge du serveur. */
  closesInMinutes?: number | null
  /** « à 12:00 » — instant absolu ISO, calculé par le navigateur qui seul connaît son fuseau. */
  closesAt?: string | null
}

/** Instant de clôture à envoyer à la base, ou `null` pour « sans limite ». */
export function resolveClosesAt(input: DeadlineInput, now: Date = new Date()): string | null {
  if (input.closesInMinutes != null) {
    return new Date(now.getTime() + input.closesInMinutes * MS_PER_MINUTE).toISOString()
  }
  return input.closesAt ?? null
}

/**
 * Prochaine occurrence de `HH:MM` dans le fuseau du navigateur : aujourd'hui
 * si elle est encore devant, demain sinon. `null` si l'heure est illisible —
 * un `<input type="time">` vidé rend une chaîne vide.
 */
export function nextOccurrence(time: string, now: Date = new Date()): Date | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time.trim())
  if (!match) return null

  const target = new Date(now)
  target.setHours(Number(match[1]), Number(match[2]), 0, 0)
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1)
  return target
}

/** Millisecondes restantes avant l'échéance, jamais négatives. */
export function remainingMs(closesAt: string, now: Date = new Date()): number {
  const target = new Date(closesAt).getTime()
  if (Number.isNaN(target)) return 0
  return Math.max(0, target - now.getTime())
}

/**
 * Temps restant lisible d'un coup d'œil : `MM:SS` sous l'heure — le format
 * d'un chronomètre —, `1 h 05` au-delà, où la seconde ne veut plus rien dire.
 */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')}`
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/** Heure de clôture affichable, dans le fuseau du visiteur. */
export function formatDeadlineTime(closesAt: string, locale = 'fr'): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(closesAt)
  )
}

interface CloseAttribution {
  /** Tous les participants avaient terminé leurs votes. */
  everyoneFinished: boolean
  closesAt: string | null
  closedAt: string | null
}

/**
 * Qui a clôturé, du point de vue du client : personne ne l'annonce, il faut le
 * déduire. Le vote complet prime — c'est la seule cause certaine —, puis
 * l'échéance atteinte, et à défaut c'est le host qui a forcé.
 */
export function closeAttribution({
  everyoneFinished,
  closesAt,
  closedAt,
}: CloseAttribution): SessionCloseReason {
  if (everyoneFinished) return 'auto'
  if (closesAt && closedAt && new Date(closedAt).getTime() >= new Date(closesAt).getTime()) {
    return 'deadline'
  }
  return 'host'
}
