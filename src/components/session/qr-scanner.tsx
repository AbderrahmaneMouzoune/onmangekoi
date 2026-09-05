'use client'

import { RiCameraLine, RiCloseLine } from '@remixicon/react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

interface QrScannerProps {
  /** Appelé avec le contenu brut du QR (lien ou code) */
  onDetected: (value: string) => void
  onClose: () => void
}

type State = 'starting' | 'scanning' | 'unsupported' | 'denied'

interface DetectedBarcode {
  rawValue: string
}
interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike

/**
 * Scanner de QR code d'invitation. Utilise `BarcodeDetector` quand le
 * navigateur le fournit (Chrome, Android), sinon décode les images de la
 * caméra avec jsQR, chargé à la demande pour ne pas alourdir la page.
 */
export function QrScanner({ onDetected, onClose }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<State>('starting')

  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false
    let frame = 0

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState('unsupported')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
      } catch {
        setState('denied')
        return
      }
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      await video.play().catch(() => undefined)
      setState('scanning')

      const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
        .BarcodeDetector
      const detector = Detector ? new Detector({ formats: ['qr_code'] }) : null
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d', { willReadFrequently: true })
      const jsQR = detector ? null : (await import('jsqr')).default

      async function tick() {
        if (cancelled || !video || video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
          frame = window.requestAnimationFrame(() => void tick())
          return
        }
        let value: string | null = null
        try {
          if (detector) {
            const codes = await detector.detect(video)
            value = codes[0]?.rawValue ?? null
          } else if (jsQR && context) {
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            context.drawImage(video, 0, 0, canvas.width, canvas.height)
            const image = context.getImageData(0, 0, canvas.width, canvas.height)
            value = jsQR(image.data, image.width, image.height)?.data ?? null
          }
        } catch {
          value = null
        }
        if (value && !cancelled) {
          onDetected(value)
          return
        }
        frame = window.requestAnimationFrame(() => void tick())
      }
      void tick()
    }

    void start()

    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [onDetected])

  return (
    <div className="relative overflow-hidden rounded-lg bg-slate ring-1 ring-line">
      <video
        ref={videoRef}
        muted
        playsInline
        aria-label="Aperçu de la caméra"
        className="aspect-square w-full object-cover"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 grid place-items-center"
      >
        <div className="size-[62%] rounded-lg border-2 border-chalk/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-3 text-chalk">
        <p role="status" className="flex items-center gap-2 text-sm">
          {state === 'starting' && (
            <>
              <Spinner className="size-4" /> Ouverture de la caméra…
            </>
          )}
          {state === 'scanning' && (
            <>
              <RiCameraLine aria-hidden="true" className="size-4" /> Vise le QR code
            </>
          )}
          {state === 'denied' && 'Accès à la caméra refusé. Saisis le code à la main.'}
          {state === 'unsupported' && 'Pas de caméra disponible ici. Saisis le code à la main.'}
        </p>
        <Button
          type="button"
          variant="chalk"
          size="icon-sm"
          onClick={onClose}
          aria-label="Fermer le scanner"
        >
          <RiCloseLine aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
