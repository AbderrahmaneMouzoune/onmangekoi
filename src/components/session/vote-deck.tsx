'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { VoteCard } from '@/components/session/vote-card'
import { VoteControls } from '@/components/session/vote-controls'
import { FormMessage } from '@/components/ui/form-message'
import { Progress } from '@/components/ui/progress'
import { submitVoteAction } from '@/lib/actions/votes'
import { cn } from '@/lib/utils'

import type { Restaurant, SessionRestaurantWithRestaurant } from '@/data-access/models'
import type { VoteValue } from '@/lib/vote'

interface VoteDeckProps {
  sessionId: string
  restaurants: SessionRestaurantWithRestaurant[]
  initialVotedIds: string[]
  initialSuperlikeUsed: boolean
  initialSuperDislikeUsed: boolean
  onFinished: () => void
}

const SWIPE_THRESHOLD = 90
const EXIT_MS = 260

type Drag = { dx: number; dy: number; active: boolean }
type Leaving = { id: string; direction: 'left' | 'right' } | null

/**
 * Deck de vote : une carte à la fois, quatre actions. Le swipe horizontal
 * couvre les deux votes courants (gauche = bof, droite = ça me va) ; les
 * jokers ne s'utilisent que par bouton pour éviter tout geste accidentel.
 * Optimiste : la carte part immédiatement, la base est la source de vérité.
 */
export function VoteDeck({
  sessionId,
  restaurants,
  initialVotedIds,
  initialSuperlikeUsed,
  initialSuperDislikeUsed,
  onFinished,
}: VoteDeckProps) {
  const [votedIds, setVotedIds] = useState<Set<string>>(() => new Set(initialVotedIds))
  const [superlikeUsed, setSuperlikeUsed] = useState(initialSuperlikeUsed)
  const [superDislikeUsed, setSuperDislikeUsed] = useState(initialSuperDislikeUsed)
  const [leaving, setLeaving] = useState<Leaving>(null)
  const [drag, setDrag] = useState<Drag>({ dx: 0, dy: 0, active: false })
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)
  const pointerStart = useRef<{ x: number; y: number } | null>(null)

  const remaining = restaurants.filter((r) => !votedIds.has(r.id) && r.restaurants)
  const current = remaining[0]
  const next = remaining[1]
  const total = restaurants.length
  const done = total - remaining.length

  const finish = useCallback(() => {
    onFinished()
  }, [onFinished])

  useEffect(() => {
    if (restaurants.length > 0 && remaining.length === 0) finish()
  }, [remaining.length, restaurants.length, finish])

  const vote = useCallback(
    async (value: VoteValue) => {
      if (!current || busy.current || leaving) return
      busy.current = true
      setError(null)

      const direction: 'left' | 'right' = value >= 1 ? 'right' : 'left'
      setLeaving({ id: current.id, direction })
      setDrag({ dx: 0, dy: 0, active: false })

      if (value === 2) setSuperlikeUsed(true)
      if (value === -2) setSuperDislikeUsed(true)

      const result = await submitVoteAction({
        sessionId,
        sessionRestaurantId: current.id,
        value,
      })

      window.setTimeout(() => {
        setLeaving(null)
        if (!result.ok) {
          // Retour arrière : la carte revient, le joker est rendu
          if (value === 2) setSuperlikeUsed(initialSuperlikeUsed)
          if (value === -2) setSuperDislikeUsed(initialSuperDislikeUsed)
          setError(result.error)
          busy.current = false
          return
        }
        setVotedIds((prev) => new Set(prev).add(current.id))
        busy.current = false
        if (result.data.finished) finish()
      }, EXIT_MS)
    },
    [current, leaving, sessionId, finish, initialSuperlikeUsed, initialSuperDislikeUsed]
  )

  // Clavier : ← bof, → ça me va
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        void vote(1)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        void vote(0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [vote])

  // Swipe (pointer events, souris et tactile)
  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (busy.current || leaving) return
    pointerStart.current = { x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ dx: 0, dy: 0, active: true })
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointerStart.current) return
    setDrag({
      dx: event.clientX - pointerStart.current.x,
      dy: event.clientY - pointerStart.current.y,
      active: true,
    })
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointerStart.current) return
    const dx = event.clientX - pointerStart.current.x
    pointerStart.current = null
    if (Math.abs(dx) >= SWIPE_THRESHOLD) {
      void vote(dx > 0 ? 1 : 0)
    } else {
      setDrag({ dx: 0, dy: 0, active: false })
    }
  }

  if (!current || !current.restaurants) return null

  const overlay: 'yes' | 'no' | null =
    drag.active && Math.abs(drag.dx) > 24 ? (drag.dx > 0 ? 'yes' : 'no') : null
  const rotate = drag.active ? drag.dx / 18 : 0
  const exitX = leaving ? (leaving.direction === 'right' ? 140 : -140) : 0

  const cardStyle: React.CSSProperties = leaving
    ? {
        transform: `translate3d(${exitX}%, -6%, 0) rotate(${exitX / 8}deg)`,
        opacity: 0,
        transition: `transform ${EXIT_MS}ms ease-in, opacity ${EXIT_MS}ms ease-in`,
      }
    : {
        transform: `translate3d(${drag.dx}px, ${drag.dy * 0.25}px, 0) rotate(${rotate}deg)`,
        transition: drag.active ? 'none' : 'transform 220ms cubic-bezier(.2,.8,.2,1)',
      }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Progress value={done} max={total} label="Progression du vote" className="flex-1" />
        <span className="font-mono text-xs text-muted-foreground tabular">
          {done}/{total}
        </span>
      </div>

      <div className="relative">
        {next?.restaurants && (
          <div aria-hidden="true" className="absolute inset-0 scale-[0.96] opacity-60">
            <VoteCard restaurant={next.restaurants} index={done + 2} total={total} />
          </div>
        )}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={cn('relative touch-pan-y', drag.active ? 'cursor-grabbing' : 'cursor-grab')}
        >
          <VoteCard
            restaurant={current.restaurants as Restaurant}
            index={done + 1}
            total={total}
            style={cardStyle}
            overlay={overlay}
          />
        </div>
      </div>

      <FormMessage error={error} />

      <VoteControls
        onVote={(value) => void vote(value)}
        disabled={Boolean(leaving)}
        superlikeUsed={superlikeUsed}
        superDislikeUsed={superDislikeUsed}
      />

      <p className="text-center text-xs text-muted-foreground">
        Glisse la carte à droite pour « ça me va », à gauche pour « bof ». Les jokers comptent
        double et ne s’utilisent qu’une fois.
      </p>
    </div>
  )
}
