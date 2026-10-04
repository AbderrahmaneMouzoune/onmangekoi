'use client'

import { RiCheckLine, RiFileCopyLine } from '@remixicon/react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'

interface CopyButtonProps extends Omit<
  React.ComponentProps<typeof Button>,
  'onClick' | 'children'
> {
  value: string
  label: string
  /** « Copié » par défaut (`common.actions.copied`), dans la langue de la page. */
  copiedLabel?: string
  /** Appelé quand la copie a réellement abouti (mesure d'usage) */
  onCopied?: () => void
}

export function CopyButton({ value, label, copiedLabel, onCopied, ...props }: CopyButtonProps) {
  const t = useTranslations('common')
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
      window.prompt(t('copyPrompt'), value)
    }
  }

  return (
    <Button type="button" onClick={handleCopy} aria-live="polite" {...props}>
      {copied ? <RiCheckLine aria-hidden="true" /> : <RiFileCopyLine aria-hidden="true" />}
      {copied ? (copiedLabel ?? t('actions.copied')) : label}
    </Button>
  )
}
