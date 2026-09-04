'use client'

import { RiShareForwardLine } from '@remixicon/react'

import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { useCanShare } from '@/hooks/use-can-share'

interface ShareResultsButtonProps {
  url: string
  sessionName: string
  winnerName: string
}

export function ShareResultsButton({ url, sessionName, winnerName }: ShareResultsButtonProps) {
  const canShare = useCanShare()

  if (!canShare) {
    return <CopyButton value={url} label="Copier le lien du classement" variant="outline" />
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.share({
            title: `${sessionName} : on mange chez ${winnerName}`,
            url,
          })
        } catch {
          // annulé
        }
      }}
    >
      <RiShareForwardLine aria-hidden="true" />
      Partager le résultat
    </Button>
  )
}
