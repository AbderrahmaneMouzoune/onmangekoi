/**
 * L'invitation native à installer l'app (`beforeinstallprompt`).
 *
 * Chrome et Edge l'émettent une fois, souvent avant même l'hydratation de la
 * page : un écouteur posé dans un effet React la raterait. Un court script en
 * tête de `<body>` (`INSTALL_PROMPT_SCRIPT`) la capture donc dès le premier
 * octet, retient l'événement sur `window` et empêche la mini-barre du
 * navigateur — c'est l'app qui choisit le moment (voir `install-offer.ts`).
 *
 * Safari et Firefox n'émettent rien : l'invitation n'y apparaît jamais, et
 * l'installation passe par le menu du navigateur (« Sur l'écran d'accueil »).
 */

/** Événement non standard, absent des types du DOM. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable'

declare global {
  interface Window {
    /** Posé par `INSTALL_PROMPT_SCRIPT`, retiré une fois l'invitation consommée. */
    __omkInstallPrompt?: BeforeInstallPromptEvent | null
  }
}

/** Émis sur `window` à chaque changement, pour les abonnés React. */
export const INSTALL_PROMPT_CHANGE = 'omk:installprompt'

/**
 * Script d'amorçage, inséré en tête de `<body>` à côté de celui de la
 * dernière visite. `appinstalled` efface l'invitation : l'app installée n'a
 * plus rien à proposer.
 */
export const INSTALL_PROMPT_SCRIPT =
  `addEventListener('beforeinstallprompt',function(e){e.preventDefault();` +
  `window.__omkInstallPrompt=e;dispatchEvent(new Event(${JSON.stringify(INSTALL_PROMPT_CHANGE)}))});` +
  `addEventListener('appinstalled',function(){window.__omkInstallPrompt=null;` +
  `dispatchEvent(new Event(${JSON.stringify(INSTALL_PROMPT_CHANGE)}))})`

/** L'installation en cours a-t-elle été acceptée depuis la bannière de l'app ? */
let acceptedFromApp = false

export function wasAcceptedFromApp(): boolean {
  return acceptedFromApp
}

export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  return typeof window === 'undefined' ? null : (window.__omkInstallPrompt ?? null)
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  window.addEventListener(INSTALL_PROMPT_CHANGE, listener)
  return () => window.removeEventListener(INSTALL_PROMPT_CHANGE, listener)
}

/**
 * Ouvre la boîte d'installation du navigateur. Une invitation ne sert qu'une
 * fois : elle est retirée quelle que soit la réponse, et le navigateur en
 * réémettra une plus tard s'il le juge bon.
 */
export async function promptInstall(): Promise<InstallOutcome> {
  const prompt = getInstallPrompt()
  if (!prompt) return 'unavailable'

  window.__omkInstallPrompt = null
  window.dispatchEvent(new Event(INSTALL_PROMPT_CHANGE))

  try {
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    acceptedFromApp = outcome === 'accepted'
    return outcome
  } catch {
    return 'unavailable'
  }
}

/** L'app tourne-t-elle déjà installée, dans sa propre fenêtre ? */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return iosStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true
}
