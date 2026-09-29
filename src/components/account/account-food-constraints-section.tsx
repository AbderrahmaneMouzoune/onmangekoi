import { RiLeafLine } from '@remixicon/react'

import { FoodConstraintsForm } from '@/components/account/food-constraints-form'
import { Skeleton } from '@/components/ui/skeleton'
import { getCurrentUser } from '@/data-access/auth'
import { getMyFoodConstraints } from '@/data-access/food-constraints'
import { createServerClient } from '@/data-access/supabase/server'

const TITLE = 'Ce que je ne peux pas manger'

/**
 * Contraintes alimentaires (issue #60) : déclarées une fois, elles évitent de
 * dépenser un veto à chaque midi pour dire « je ne peux pas manger là ».
 * Facultatives, réversibles, et jamais nominatives pour les autres.
 */
export async function AccountFoodConstraintsSection() {
  const [supabase, user] = await Promise.all([createServerClient(), getCurrentUser()])
  if (!user) return null

  const constraints = await getMyFoodConstraints(supabase, user.id)

  return (
    <section className="flex flex-col gap-3 rounded-lg bg-surface p-4 ring-1 ring-line">
      <Intro />
      <FoodConstraintsForm initial={constraints} />
    </section>
  )
}

function Intro() {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <RiLeafLine aria-hidden="true" className="size-4.5 text-muted-foreground" />
        {TITLE}
      </h2>
      <p className="text-sm text-muted-foreground">
        Optionnel. Un resto qui ne te convient pas est signalé dans tes sessions, sans jamais dire
        qui : « 1 participant ne peut pas y manger ». Tu gardes ton veto pour trancher entre deux
        envies.
      </p>
    </div>
  )
}

/** Silhouette : l'intitulé et l'explication sont les mêmes pour tout le monde. */
export function AccountFoodConstraintsFallback() {
  return (
    <section
      aria-busy="true"
      className="flex flex-col gap-3 rounded-lg bg-surface p-4 ring-1 ring-line"
    >
      <Intro />
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-9 w-24 rounded-full" />
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-9 w-14 rounded-full" />
        ))}
      </div>
    </section>
  )
}
