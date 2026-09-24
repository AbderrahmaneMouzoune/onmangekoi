import 'server-only'

import { env } from '@/env'
import { type TurnstileVerdict } from '@/lib/turnstile'

/**
 * Vérification serveur du captcha Cloudflare Turnstile.
 *
 * Le captcha ne protège pas un formulaire, il protège la **création de
 * comptes** : chaque pseudo choisi crée un utilisateur anonyme Supabase, et
 * c'est ce coût quasi nul qui rendrait contournable la limitation de débit du
 * « Rejoindre » (un script bloqué au 11ᵉ essai n'aurait qu'à reprendre un
 * pseudo neuf). Les deux garde-fous ne valent que posés ensemble.
 *
 * Interrupteur : sans `TURNSTILE_SECRET_KEY` **et** `NEXT_PUBLIC_TURNSTILE_SITE_KEY`,
 * le module répond `ok` sans rien appeler — c'est ce qui permet aux tests e2e,
 * à la CI et au développement local de tourner sans compte Cloudflare.
 *
 * La clé secrète ne sort jamais d'ici : elle n'est ni préfixée `NEXT_PUBLIC_`,
 * ni transmise au navigateur.
 */

const VERIFY_ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const REQUEST_TIMEOUT_MS = 5000
/** Cloudflare plafonne le jeton à 2048 octets : au-delà, inutile d'appeler. */
const MAX_TOKEN_LENGTH = 2048

export function isTurnstileEnabled(): boolean {
  return Boolean(env.TURNSTILE_SECRET_KEY && env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
}

export async function verifyTurnstile(token: FormDataEntryValue | null): Promise<TurnstileVerdict> {
  const secret = env.TURNSTILE_SECRET_KEY
  if (!secret || !isTurnstileEnabled()) return 'ok'

  if (typeof token !== 'string' || token.length === 0) return 'missing'
  if (token.length > MAX_TOKEN_LENGTH) return 'rejected'

  const body = new URLSearchParams({ secret, response: token })

  let payload: { success?: unknown }
  try {
    const response = await fetch(VERIFY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    })
    if (!response.ok) return unreachable(`siteverify a répondu ${response.status}`)
    payload = await response.json()
  } catch (error) {
    return unreachable(error instanceof Error ? error.message : 'appel impossible')
  }

  return payload.success === true ? 'ok' : 'rejected'
}

/**
 * Cloudflare injoignable : on laisse passer. Un captcha qui tombe en panne ne
 * doit pas fermer l'onboarding — la limitation de débit côté base, elle, reste
 * en place, et le risque couvert ici est le spam, pas la fraude. La panne est
 * journalisée pour qu'elle ne passe pas inaperçue.
 */
function unreachable(reason: string): TurnstileVerdict {
  console.warn(`[turnstile] vérification ignorée — ${reason}`)
  return 'ok'
}
