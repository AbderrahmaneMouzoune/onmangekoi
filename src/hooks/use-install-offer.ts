'use client'

import { useCallback, useState, useSyncExternalStore } from 'react'

import { captureEvent } from '@/lib/analytics/client'
import {
  dismissInstallOffer,
  getInstallOffer,
  getServerInstallOffer,
  shouldOfferInstall,
  subscribeInstallOffer,
} from '@/lib/pwa/install-offer'
import {
  getInstallPrompt,
  isStandalone,
  promptInstall,
  subscribeInstallPrompt,
} from '@/lib/pwa/install-prompt'

export interface InstallOffer {
  /** La bannière doit-elle s'afficher ? */
  visible: boolean
  /** Ouvre la boîte d'installation du navigateur. */
  install: () => Promise<void>
  /** « Plus tard » : la bannière se tait pour un moment. */
  dismiss: () => void
}

const noPrompt = () => null

/**
 * État de la proposition d'installation : l'invitation du navigateur, la
 * mémoire du navigateur (session aboutie, refus récent), l'app déjà
 * installée. Faux au rendu serveur et à l'hydratation — tout vit côté client.
 */
export function useInstallOffer(): InstallOffer {
  const state = useSyncExternalStore(subscribeInstallOffer, getInstallOffer, getServerInstallOffer)
  const prompt = useSyncExternalStore(subscribeInstallPrompt, getInstallPrompt, noPrompt)
  // Le délai de refus se compte en mois : l'heure de montage suffit.
  const [now] = useState(() => Date.now())

  const visible =
    prompt !== null &&
    shouldOfferInstall({ state, canPrompt: true, standalone: isStandalone(), now })

  const install = useCallback(async () => {
    const outcome = await promptInstall()
    if (outcome === 'unavailable') return
    captureEvent('pwa_install_prompted', { outcome })
    // Refusée dans la boîte du navigateur : même silence qu'un « Plus tard ».
    if (outcome === 'dismissed') dismissInstallOffer()
  }, [])

  const dismiss = useCallback(() => {
    captureEvent('pwa_install_prompted', { outcome: 'later' })
    dismissInstallOffer()
  }, [])

  return { visible, install, dismiss }
}
