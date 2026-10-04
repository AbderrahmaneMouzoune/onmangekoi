/**
 * Abonnement aux notifications push, côté navigateur (issue #7).
 *
 * La permission n'est **jamais** demandée d'elle-même : `subscribeToPush` ne
 * s'appelle que depuis le clic sur « Me prévenir ». Un navigateur qui voit
 * une demande surgir au chargement la bloque souvent pour de bon — et
 * l'utilisateur avec lui.
 *
 * Sur iPhone, le Web Push n'existe que dans l'app installée sur l'écran
 * d'accueil (iOS 16.4+) : dans Safari, `PushManager` est absent et l'état
 * vaut `unsupported`.
 */

import { getServiceWorkerRegistration, isServiceWorkerEnabled } from '@/lib/pwa/registration'

/** Où en est ce navigateur vis-à-vis des notifications. */
export type PushPermission = 'unsupported' | 'default' | 'granted' | 'denied'

/** Ce que ce navigateur sait faire, lu sans rien demander. */
export function pushPermission(): PushPermission {
  if (
    typeof window === 'undefined' ||
    !isServiceWorkerEnabled() ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return 'unsupported'
  }
  return Notification.permission
}

/**
 * La clé publique VAPID, du base64url de la configuration aux octets
 * qu'attend `pushManager.subscribe`.
 */
export function applicationServerKey(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const base64 = padded + '='.repeat((4 - (padded.length % 4)) % 4)
  const binary = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/** L'abonnement déjà posé sur ce navigateur, s'il y en a un. */
export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (pushPermission() === 'unsupported') return null
  const registration = await getServiceWorkerRegistration()
  if (!registration) return null
  try {
    return await registration.pushManager.getSubscription()
  } catch {
    return null
  }
}

export type SubscribeOutcome =
  | { status: 'subscribed'; subscription: PushSubscriptionJSON }
  /** Refusée : seul le navigateur peut revenir dessus. */
  | { status: 'denied' }
  /** Boîte fermée sans répondre : on pourra redemander. */
  | { status: 'dismissed' }
  | { status: 'unsupported' }
  | { status: 'failed' }

/**
 * Demande la permission — seulement si elle n'est pas déjà tranchée — puis
 * abonne ce navigateur auprès de son service push. À n'appeler que depuis un
 * geste de l'utilisateur.
 */
export async function subscribeToPush(publicKey: string): Promise<SubscribeOutcome> {
  const permission = pushPermission()
  if (permission === 'unsupported') return { status: 'unsupported' }
  if (permission === 'denied') return { status: 'denied' }

  if (permission === 'default') {
    const answer = await Notification.requestPermission()
    if (answer === 'denied') return { status: 'denied' }
    if (answer !== 'granted') return { status: 'dismissed' }
  }

  const registration = await getServiceWorkerRegistration()
  if (!registration) return { status: 'unsupported' }

  try {
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(publicKey),
      }))
    return { status: 'subscribed', subscription: subscription.toJSON() }
  } catch {
    return { status: 'failed' }
  }
}

/** Désabonne ce navigateur ; rend l'endpoint abandonné, à retirer côté serveur. */
export async function unsubscribeFromPush(): Promise<string | null> {
  const subscription = await currentPushSubscription()
  if (!subscription) return null
  const endpoint = subscription.endpoint
  try {
    await subscription.unsubscribe()
  } catch {
    // Le navigateur a déjà oublié l'abonnement : il reste à l'oublier côté serveur.
  }
  return endpoint
}

/**
 * iPhone ou iPad : le seul cas courant où le Web Push manque et où l'on peut
 * dire quoi faire — installer l'app sur l'écran d'accueil. Les iPad récents
 * se présentent comme un Mac ; l'écran tactile les trahit.
 */
export function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  )
}
