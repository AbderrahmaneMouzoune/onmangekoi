/**
 * Horaires d'ouverture : lecture du `jsonb` stocké en base et calcul de
 * « ouvert maintenant ». La forme est déjà validée côté base
 * (`public.is_opening_hours`) ; on la revalide ici car une donnée importée
 * reste une donnée externe.
 */
import { z } from 'zod'

import type { Json } from '@/data-access/models'

/** `HH:MM` sur 24 h. La fermeture accepte `24:00` (jusqu'à minuit). */
const OPEN_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const CLOSE_TIME = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/

const OpeningHoursSchema = z.object({
  /** Fuseau IANA du restaurant. Absent : on raisonne dans celui du visiteur. */
  timezone: z.string().min(1).optional(),
  periods: z.array(
    z.object({
      /** 0 = dimanche, comme `Date#getDay` */
      day: z.number().int().min(0).max(6),
      open: z.string().regex(OPEN_TIME),
      close: z.string().regex(CLOSE_TIME),
    })
  ),
})

export type OpeningHours = z.infer<typeof OpeningHoursSchema>
export type OpeningPeriod = OpeningHours['periods'][number]

/** `null` si la donnée est absente, mal formée ou vide : l'horaire est inconnu. */
export function parseOpeningHours(value: Json | null | undefined): OpeningHours | null {
  const parsed = OpeningHoursSchema.safeParse(value)
  if (!parsed.success || parsed.data.periods.length === 0) return null
  return parsed.data
}

const MINUTES_PER_DAY = 24 * 60
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':')
  return Number(hours) * 60 + Number(minutes)
}

/** Minute de la semaine (0 = dimanche 00:00) dans le fuseau donné. */
function weekMinutes(date: Date, timeZone: string | undefined): number {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(date)
      const part = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((candidate) => candidate.type === type)?.value ?? ''
      const day = WEEKDAYS.indexOf(part('weekday'))
      const hours = Number(part('hour'))
      const minutes = Number(part('minute'))
      if (day >= 0 && Number.isFinite(hours) && Number.isFinite(minutes)) {
        return day * MINUTES_PER_DAY + hours * 60 + minutes
      }
    } catch {
      // Fuseau inconnu du moteur : on retombe sur l'heure du visiteur.
    }
  }
  return date.getDay() * MINUTES_PER_DAY + date.getHours() * 60 + date.getMinutes()
}

/**
 * `true` ouvert, `false` fermé, `null` inconnu — trois états à distinguer :
 * « on ne sait pas » ne doit jamais s'afficher comme « fermé ».
 *
 * Une période dont la fermeture précède l'ouverture passe minuit, y compris
 * par-dessus la fin de semaine (samedi 22:00 → 02:00 couvre dimanche 01:00).
 */
export function isOpenNow(hours: OpeningHours | null, now: Date = new Date()): boolean | null {
  if (!hours || hours.periods.length === 0) return null
  const current = weekMinutes(now, hours.timezone)

  return hours.periods.some((period) => {
    const start = period.day * MINUTES_PER_DAY + toMinutes(period.open)
    let end = period.day * MINUTES_PER_DAY + toMinutes(period.close)
    if (end <= start) end += MINUTES_PER_DAY
    return (
      (current >= start && current < end) ||
      (current + MINUTES_PER_WEEK >= start && current + MINUTES_PER_WEEK < end)
    )
  })
}
