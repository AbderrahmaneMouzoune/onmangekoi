'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'

import { submitVoteAction } from '@/actions/votes'
import { VoteCard } from '@/components/session/vote-card'
import { VoteControls } from '@/components/session/vote-controls'
import { FormMessage } from '@/components/ui/form-message'
import { Progress } from '@/components/ui/progress'
import { VOTE_ACTIONS, voteActionByKey, voteActionByValue } from '@/domain/vote'
import { captureEvent } from '@/lib/analytics/client'
import { cn } from '@/lib/utils'

import type { Restaurant, SessionRestaurantWithRestaurant } from '@/data-access/models'
import type { VoteValue } from '@/domain/vote'

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
  const [announcement, setAnnouncement] = useState('')
  const busy = useRef(false)
  const pointerStart = useRef<{ x: number; y: number } | null>(null)
  const announcedId = useRef<string | null>(null)
  const lastVoteLabel = useRef<string | null>(null)

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
      // Les boutons désactivés disent déjà non ; le clavier doit dire pareil.
      if ((value === 2 && superlikeUsed) || (value === -2 && superDislikeUsed)) return
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
        lastVoteLabel.current = voteActionByValue(value)?.label ?? null
        setVotedIds((prev) => new Set(prev).add(current.id))
        busy.current = false

        // `recorded` distingue un vote réellement enregistré d'une carte déjà
        // votée que la base fait simplement passer.
        if (result.data.recorded) {
          captureEvent('vote_submitted', {
            session_id: sessionId,
            value,
            kind: voteActionByValue(value)?.kind ?? 'no',
            position: done + 1,
            restaurant_count: total,
          })
        }

        if (result.data.finished) finish()
      }, EXIT_MS)
    },
    [
      current,
      leaving,
      sessionId,
      finish,
      initialSuperlikeUsed,
      initialSuperDislikeUsed,
      superlikeUsed,
      superDislikeUsed,
      done,
      total,
    ]
  )

  /**
   * Clavier : `1`–`4` dans l'ordre des boutons, ← et → pour les deux votes
   * courants, Entrée pour « ça me va ». Les jokers n'ont ni flèche ni geste :
   * seul un choix explicite les dépense.
   */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (isTypingTarget(event.target)) return
      const action = voteActionByKey(event.key)
      if (!action) return
      // Entrée active déjà le bouton qui a le focus : ne pas voter deux fois.
      if (event.key === 'Enter' && isActivatable(event.target)) return
      event.preventDefault()
      void vote(action.value)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [vote])

  /**
   * La carte change sans que le focus bouge : sans région live, un lecteur
   * d'écran ne dirait rien du restaurant suivant ni de l'avancement.
   */
  useEffect(() => {
    const restaurant = current?.restaurants
    if (!current || !restaurant || announcedId.current === current.id) return
    announcedId.current = current.id
    const confirmation = lastVoteLabel.current ? `${lastVoteLabel.current} enregistré. ` : ''
    lastVoteLabel.current = null
    setAnnouncement(`${confirmation}Restaurant ${done + 1} sur ${total} : ${restaurant.name}.`)
  }, [current, done, total])

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

      {/* Le seul canal du deck vers un lecteur d'écran : la carte, elle, change
          sans reprendre le focus. */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>

      <div className="relative">
        {next?.restaurants && (
          <div aria-hidden="true" className="absolute inset-0 scale-[0.96] opacity-60">
            <VoteCard
              restaurant={next.restaurants}
              index={done + 2}
              total={total}
              priority={false}
            />
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
            priority
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

      <div className="flex flex-col gap-1.5 text-center text-xs text-muted-foreground">
        <p>
          Glisse la carte à droite pour « ça me va », à gauche pour « bof ». Les jokers comptent
          double et ne s’utilisent qu’une fois.
        </p>
        <p>
          Au clavier :{' '}
          {VOTE_ACTIONS.map((action, index) => (
            <Fragment key={action.kind}>
              {index > 0 && ' · '}
              <Key>{action.shortcuts[0]}</Key> {action.label.toLowerCase()}
            </Fragment>
          ))}
          . <Key>←</Key> et <Key>→</Key> reprennent « bof » et « ça me va », <Key>Entrée</Key>{' '}
          valide « ça me va ».
        </p>
      </div>
    </div>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-line-strong bg-surface px-1 font-mono text-[0.65rem] text-ink-2">
      {children}
    </kbd>
  )
}

const TYPING_TAGS = ['INPUT', 'TEXTAREA', 'SELECT']

/** Une saisie en cours garde ses touches : on ne vote pas en tapant un pseudo. */
function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element || typeof element.tagName !== 'string') return false
  return TYPING_TAGS.includes(element.tagName) || element.isContentEditable === true
}

/** Un élément que la touche Entrée active déjà d'elle-même. */
function isActivatable(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  return Boolean(element?.closest?.('button, a[href], [role="button"], summary'))
}
