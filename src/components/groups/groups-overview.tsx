import { RiGroupLine } from '@remixicon/react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { GroupCard } from '@/components/groups/group-card'
import { ArrowKeyList } from '@/components/ui/arrow-key-list'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getMyGroups } from '@/data-access/groups'
import { createServerClient } from '@/data-access/supabase/server'
import { cn } from '@/lib/utils'

/** Groupes de la personne connectée : la RLS ne montre que les siens. */
export async function GroupsOverview() {
  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) redirect(router.setup(router.groups()))

  const groups = await getMyGroups(supabase)

  if (groups.length === 0) return <NoGroups />

  return (
    <ArrowKeyList
      orientation="both"
      aria-label="Mes groupes"
      className="grid gap-3 lg:grid-cols-2 lg:items-start"
    >
      {groups.map((group) => (
        <GroupCard key={group.id} group={group} meId={user.id} />
      ))}
    </ArrowKeyList>
  )
}

/**
 * Écran vide des groupes. Un groupe ne se crée pas depuis ici : il se
 * sauvegarde au moment où il vient de voter ensemble — c'est là qu'on sait
 * qui en fait partie.
 */
function NoGroups() {
  return (
    <EmptyState
      icon={<RiGroupLine />}
      title="Aucun groupe pour l’instant"
      description="À la fin d’une session, « Sauvegarder ce groupe » garde l’équipe du jour. La prochaine fois, tu l’invites d’un clic."
      action={
        <Link href={router.sessionNew()} className={cn(buttonVariants())}>
          Lancer une session
        </Link>
      }
    />
  )
}

/**
 * Silhouette des groupes : seules les cartes attendent la base. L'écran vide,
 * lui, est déjà le bon pour qui n'a pas encore de groupe.
 */
export function GroupsOverviewFallback() {
  return (
    <div aria-busy="true" className="grid gap-3 lg:grid-cols-2 lg:items-start">
      <SkeletonGroup memberWidths={['w-24', 'w-20', 'w-28']} />
      <SkeletonGroup memberWidths={['w-20', 'w-24']} />
    </div>
  )
}

function SkeletonGroup({ memberWidths }: { memberWidths: string[] }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface p-4 ring-1 ring-line">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3.5 w-20" />
        </div>
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <div className="flex flex-wrap gap-2">
        {memberWidths.map((width) => (
          <Skeleton key={width} className={cn('h-10 rounded-full', width)} />
        ))}
      </div>
    </div>
  )
}
