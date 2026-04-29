'use client'

import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

interface Props {
  inviteToken: string
  inviteCode: string
  sessionName: string
}

export function InviteCard({ inviteToken, inviteCode, sessionName }: Props) {
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)

  const inviteUrl = `${window.location.origin}/join/${inviteToken}`

  async function copyLink() {
    await navigator.clipboard.writeText(inviteUrl)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  async function copyCode() {
    await navigator.clipboard.writeText(inviteCode)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  async function handleShare() {
    if (navigator.share) {
      await navigator.share({
        title: `Rejoins "${sessionName}" sur onmangekoi`,
        url: inviteUrl,
      })
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Invite le groupe</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">Code court</p>
          <div className="flex items-center gap-3">
            <span className="font-mono text-3xl font-bold tracking-[0.2em]">{inviteCode}</span>
            <Button variant="outline" size="sm" onClick={copyCode}>
              {copiedCode ? '✓ Copié' : 'Copier'}
            </Button>
          </div>
          <Badge variant="secondary" className="text-xs">
            Dites le code à voix haute
          </Badge>
        </div>

        <Separator />

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 text-sm" onClick={copyLink}>
            {copiedLink ? '✓ Lien copié' : 'Copier le lien'}
          </Button>
          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <Button onClick={handleShare} className="text-sm">
              Partager
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
