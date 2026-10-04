import { RiDownloadLine, RiShieldUserLine } from '@remixicon/react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

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
  const t = useTranslations('account.data')
  return (
    <section className="flex flex-col gap-3 rounded-lg bg-surface p-4 ring-1 ring-line">
      <div className="flex flex-col gap-0.5">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <RiShieldUserLine aria-hidden="true" className="size-4.5 text-muted-foreground" />
          {t('title')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t.rich('description', {
            link: (chunks) => (
              <Link href={router.privacy()} className="font-medium text-brand hover:underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </div>

      <a
        href={router.accountExport()}
        download
        className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}
      >
        <RiDownloadLine aria-hidden="true" />
        {t('export')}
      </a>

      <Separator className="my-1" />

      <p className="text-sm text-muted-foreground">{t('deleteNote')}</p>
      <DeleteAccountButton />
    </section>
  )
}
