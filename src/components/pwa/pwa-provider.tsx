'use client'

import { useEffect } from 'react'

import { captureEvent } from '@/lib/analytics/client'
import { wasAcceptedFromApp } from '@/lib/pwa/install-prompt'
import { registerServiceWorker } from '@/lib/pwa/registration'

/**
 * Point d'entrée de la PWA, monté dans le layout racine : enregistre le
 * service worker une fois la page chargée — il ne dispute pas la bande
 * passante du premier affichage — et compte les installations, qu'elles
 * viennent de la bannière ou du menu du navigateur. Ne rend rien et ne lit
 * rien du serveur : il reste dans la coquille prérendue de chaque route.
 */
export function PwaProvider() {
  useEffect(() => {
    const register = () => void registerServiceWorker()
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })

    const onInstalled = () =>
      captureEvent('pwa_installed', { via: wasAcceptedFromApp() ? 'banner' : 'browser' })
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('load', register)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  return null
}
