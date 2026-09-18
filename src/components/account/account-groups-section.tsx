import { RiGroupLine } from '@remixicon/react'
import Link from 'next/link'

import { GroupCard } from '@/components/groups/group-card'
import { router } from '@/config/router.config'
import { getCurrentUser } from '@/data-access/auth'
import { getMyGroups } from '@/data-access/groups'
import { createServerClient } from '@/data-access/supabase/server'

/** Les trois groupes les plus récents ; le reste vit sur `/groups`. */
const PREVIEW = 3

/**
 * Mes groupes, depuis le compte : c'est ici qu'on vient pour se retirer de
 * quelque chose. Quitter un groupe se fait donc sur place, sans détour.
 *
 * Sans groupe, la section ne s'affiche pas du tout : elle n'apprendrait rien
 * à qui n'en a jamais créé — c'est le rôle de l'écran vide de `/groups`.
 */
export async function AccountGroupsSection() {
  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) return null

  const groups = await getMyGroups(supabase)
  if (groups.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <RiGroupLine aria-hidden="true" className="size-4.5 text-muted-foreground" />
          Mes groupes
        </h2>
        <Link href={router.groups()} className="text-sm font-medium text-brand hover:underline">
          Tout voir
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        Quitter un groupe, c’est ne plus être pré-invité à ses sessions. Celles déjà rejointes ne
        bougent pas.
      </p>
      <ul className="flex flex-col gap-3">
        {groups.slice(0, PREVIEW).map((group) => (
          <GroupCard key={group.id} group={group} meId={user.id} />
        ))}
      </ul>
    </section>
  )
}
