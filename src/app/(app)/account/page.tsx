import {
  RiCheckLine,
  RiDownloadLine,
  RiMailLine,
  RiShieldCheckLine,
  RiShieldUserLine,
} from '@remixicon/react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { DeleteAccountButton } from '@/components/account/delete-account-button'
import { LinkEmailForm } from '@/components/account/link-email-form'
import { SetPasswordForm } from '@/components/account/set-password-form'
import { SignOutButton } from '@/components/account/sign-out-button'
import { UpdatePseudoForm } from '@/components/account/update-pseudo-form'
import { PageHeader } from '@/components/layout/page-header'
import { Shell } from '@/components/layout/shell'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Separator } from '@/components/ui/separator'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getProfile } from '@/data-access/profile'
import { createServerClient } from '@/data-access/supabase/server'
import { displayPseudo } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Mon compte' }

interface Props {
  searchParams: Promise<{ auth?: string }>
}

const AUTH_MESSAGES: Record<string, { error?: string; success?: string }> = {
  invalid: { error: 'Ce lien de confirmation est invalide.' },
  expired: { error: 'Ce lien de confirmation a expiré. Renvoie un email depuis cette page.' },
  confirmed: { success: 'Adresse email confirmée.' },
}

export default async function AccountPage({ searchParams }: Props) {
  const [{ auth }, supabase, user] = await Promise.all([
    searchParams,
    createServerClient(),
    getCurrentUser(),
  ])
  if (!user) redirect(router.setup(router.account()))

  const profile = await getProfile(supabase, user.id)
  const pseudo = displayPseudo(profile?.pseudo)
  const isAnonymous = Boolean(user.is_anonymous)
  const emailConfirmed = Boolean(user.email_confirmed_at) && !isAnonymous
  const pendingEmail = user.new_email ?? (!emailConfirmed ? user.email : null)
  const hasPassword = emailConfirmed && Boolean(user.app_metadata?.providers?.includes('email'))
  const authMessage = auth ? AUTH_MESSAGES[auth] : undefined

  return (
    <Shell>
      <PageHeader
        eyebrow="Compte"
        title="Mon compte"
        back={{ href: router.home(), label: 'Accueil' }}
      />

      <FormMessage error={authMessage?.error} success={authMessage?.success} />

      <section className="flex items-center gap-4 rounded-lg bg-surface p-4 ring-1 ring-line">
        <Avatar name={pseudo} size="lg" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate font-display text-lg font-bold">{pseudo}</p>
          {emailConfirmed ? (
            <Badge variant="yes">
              <RiShieldCheckLine aria-hidden="true" />
              Compte lié · {user.email}
            </Badge>
          ) : (
            <Badge variant="outline">Invité · sans compte</Badge>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-base font-semibold">Pseudo</h2>
        <UpdatePseudoForm currentPseudo={profile?.pseudo ?? ''} />
      </section>

      <section className="flex flex-col gap-3 rounded-lg bg-surface p-4 ring-1 ring-line">
        <div className="flex flex-col gap-0.5">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <RiMailLine aria-hidden="true" className="size-4.5 text-muted-foreground" />
            Retrouver mes listes ailleurs
          </h2>
          <p className="text-sm text-muted-foreground">
            Optionnel. Lier un email et un mot de passe permet de se reconnecter depuis un autre
            appareil. Tout le reste fonctionne sans.
          </p>
        </div>

        <ol className="flex flex-col gap-4">
          <li className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <StepMark done={emailConfirmed} index={1} />
              Lier une adresse email
            </p>
            {emailConfirmed ? (
              <p className="pl-8 text-sm text-muted-foreground">{user.email}</p>
            ) : (
              <div className="pl-8">
                <LinkEmailForm pendingEmail={pendingEmail} />
              </div>
            )}
          </li>
          <li className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <StepMark done={hasPassword} index={2} />
              Définir un mot de passe
            </p>
            {emailConfirmed ? (
              <div className="pl-8">
                <SetPasswordForm hasPassword={hasPassword} />
              </div>
            ) : (
              <p className="pl-8 text-sm text-muted-foreground">
                Disponible une fois l’email confirmé.
              </p>
            )}
          </li>
        </ol>
      </section>

      <section className="flex flex-col gap-3 rounded-lg bg-surface p-4 ring-1 ring-line">
        <div className="flex flex-col gap-0.5">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <RiShieldUserLine aria-hidden="true" className="size-4.5 text-muted-foreground" />
            Mes données
          </h2>
          <p className="text-sm text-muted-foreground">
            Récupère une copie de tout ce que l’app sait de toi, ou supprime ton compte. Le détail
            de ce qui est conservé est sur la{' '}
            <Link href={router.privacy()} className="font-medium text-brand hover:underline">
              page confidentialité
            </Link>
            .
          </p>
        </div>

        <a
          href={router.accountExport()}
          download
          className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}
        >
          <RiDownloadLine aria-hidden="true" />
          Exporter mes données (JSON)
        </a>

        <Separator className="my-1" />

        <p className="text-sm text-muted-foreground">
          La suppression est immédiate et définitive. Une confirmation à recopier détaille ce qui
          disparaît avant de lancer quoi que ce soit.
        </p>
        <DeleteAccountButton />
      </section>

      <div className="flex justify-center pt-2">
        <SignOutButton isAnonymous={isAnonymous} />
      </div>
    </Shell>
  )
}

function StepMark({ done, index }: { done: boolean; index: number }) {
  return (
    <span
      aria-hidden="true"
      className={
        done
          ? 'flex size-6 items-center justify-center rounded-full bg-yes text-white'
          : 'flex size-6 items-center justify-center rounded-full bg-surface-2 font-mono text-xs text-muted-foreground'
      }
    >
      {done ? <RiCheckLine className="size-3.5" /> : index}
    </span>
  )
}
