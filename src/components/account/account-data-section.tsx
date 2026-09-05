import { RiDownloadLine, RiShieldUserLine } from '@remixicon/react'
import Link from 'next/link'

import { DeleteAccountButton } from '@/components/account/delete-account-button'
import { buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { router } from '@/config/router.config'
import { cn } from '@/lib/utils'

/**
 * Export et suppression du compte (art. 17 et 20 RGPD).
 * Rien ici ne dépend de la session — le lien d'export et la modale de
 * confirmation sont les mêmes pour tout le monde — donc la section est
 * prérendue avec la coquille de la page plutôt que diffusée avec le reste.
 */
export function AccountDataSection() {
  return (
    <section className="flex flex-col gap-3 rounded-lg bg-surface p-4 ring-1 ring-line">
      <div className="flex flex-col gap-0.5">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <RiShieldUserLine aria-hidden="true" className="size-4.5 text-muted-foreground" />
          Mes données
        </h2>
        <p className="text-sm text-muted-foreground">
          Récupère une copie de tout ce que l’app sait de toi, ou supprime ton compte. Le détail de
          ce qui est conservé est sur la{' '}
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
  )
}
