'use client'

import { RiCheckLine, RiFileCopyLine } from '@remixicon/react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'

interface CopyButtonProps extends Omit<
  React.ComponentProps<typeof Button>,
  'onClick' | 'children'
> {
  value: string
  label: string
  copiedLabel?: string
  /** Appelé quand la copie a réellement abouti (mesure d'usage) */
  onCopied?: () => void
}

export function CopyButton({
  value,
  label,
  copiedLabel = 'Copié',
  onCopied,
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      onCopied?.()
    } catch {
      // Clipboard indisponible (contexte non sécurisé) : on sélectionne à défaut
      window.prompt('Copie ce lien :', value)
    }
  }

  return (
    <Button type="button" onClick={handleCopy} aria-live="polite" {...props}>
      {copied ? <RiCheckLine aria-hidden="true" /> : <RiFileCopyLine aria-hidden="true" />}
      {copied ? copiedLabel : label}
    </Button>
  )
}
