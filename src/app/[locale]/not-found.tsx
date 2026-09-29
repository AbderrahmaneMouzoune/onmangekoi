import { RiRestaurant2Line } from '@remixicon/react'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { Shell } from '@/components/layout/shell'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { router } from '@/config/router.config'
import { cn } from '@/lib/utils'

export default async function NotFound() {
  const [t, tCommon] = await Promise.all([
    getTranslations('layout.notFound'),
    getTranslations('common.actions'),
  ])

  return (
    <Shell className="justify-center">
      <EmptyState
        icon={<RiRestaurant2Line />}
        title={t('title')}
        description={t('description')}
        action={
          <Link href={router.home()} className={cn(buttonVariants())}>
            {tCommon('backHome')}
          </Link>
        }
      />
    </Shell>
  )
}
