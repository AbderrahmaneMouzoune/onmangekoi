'use client'

import { RiShareForwardLine } from '@remixicon/react'

import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { useCanShare } from '@/hooks/use-can-share'

interface ShareResultsButtonProps {
  url: string
  /** Titre proposé à la feuille de partage native */
  title: string
  /** Libellé du bouton de partage, et de la copie quand le partage manque */
  label: string
  variant?: React.ComponentProps<typeof Button>['variant']
  className?: string
  onShared?: () => void
}

/**
 * Partage d'un lien de classement : la feuille native quand le navigateur en
 * a une (tous les téléphones), la copie sinon (la plupart des ordinateurs).
 */
export function ShareResultsButton({
  url,
  title,
  label,
  variant = 'outline',
  className,
  onShared,
}: ShareResultsButtonProps) {
  const canShare = useCanShare()

  if (!canShare) {
    return (
      <CopyButton
        value={url}
        label={label}
        variant={variant}
        className={className}
        onCopied={onShared}
      />
    )
  }

  return (
    <Button
      type="button"
      variant={variant}
      className={className}
      onClick={async () => {
        try {
          await navigator.share({ title, url })
          onShared?.()
        } catch {
          // annulé
        }
      }}
    >
      <RiShareForwardLine aria-hidden="true" />
      {label}
    </Button>
  )
}
