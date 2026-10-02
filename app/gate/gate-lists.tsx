'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { gateDb, type LedgerRow, type RosterRow } from '@/gate/db'
import { gateBandCard } from '@/gate/band-card'
import { tierColour, type TierCode } from '@/lib/design'
import { formatLedgerTime } from '@/lib/format'
import { useDomTheme } from '@/lib/use-theme'
import { Icon } from '@/components/icon'

/**
 * The folds under the gate's scanner and the vehicle plate field (Vipin,
 * 1 Oct, prototype option A): what this gate just did, and who or what is
 * still to come. Everything is read from this phone's cache, so they work
 * with the radio off like the scanner (non-negotiable #7). Tapping a row
 * reopens the scan or plate result for it; nothing here writes.
 */

const istDay = (at: string | number | Date) => new Date(at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

/** Today in India, read once per mount so render stays pure. */
function useTodayIst(): string {
  const [today] = useState(() => istDay(new Date()))
  return today
}

function minutesAgo(iso: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  return formatLedgerTime(iso)
}

type Fold = { id: string; title: string; count: number; body: ReactNode }

/** One fold open at a time, so the scanner above never scrolls off. */
function Accordion({ folds, initial }: { folds: Fold[]; initial: string | null }) {
  const [open, setOpen] = useState<string | null>(initial)
  const base = useId()
  return (
    <div className="gate-folds">
      {folds.map((fold) => {
        const expanded = open === fold.id
        const panelId = `${base}-${fold.id}`
        return (
          <section key={fold.id} className="gate-fold" data-open={expanded ? '' : undefined}>
            <h2 className="gate-fold-h">
              <button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setOpen(expanded ? null : fold.id)}>
                <span>{fold.title}</span>
                <span className="gate-fold-n">{fold.count}<Icon name="caret-down" /></span>
              </button>
            </h2>
            <FoldBody id={panelId} expanded={expanded}>{fold.body}</FoldBody>
          </section>
        )
      })}
    </div>
  )
}

/**
 * One clock for the whole fold: the height, the content's fade and the caret
 * (gate.css reads --fold-ms) share a duration and an easing, so nothing is
 * still moving after the rest has stopped. A short fold takes less time than
 * a long one, so a one-line fold does not crawl.
 */
const EASE = 'cubic-bezier(.2, 0, 0, 1)'
const foldMs = (px: number) => Math.round(Math.min(340, 160 + px * 0.35))

/**
 * A fold's body, animated open and shut from its measured height. `hidden`
 * stays the real state (it is what the server renders and what keeps a
 * closed fold out of the tab order); while one shuts it is shown just long
 * enough to animate away. A toggle mid-animation starts from wherever the
 * last one had got to, so a quick double tap never jumps.
 */
function FoldBody({ id, expanded, children }: { id: string; expanded: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  /** The state last drawn; an effect that runs again for it (a remount, Strict Mode) animates nothing. */
  const drawn = useRef(expanded)
  const from = useRef<{ height: number; opacity: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    const inner = innerRef.current
    if (!el || !inner || drawn.current === expanded) return
    drawn.current = expanded
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    el.hidden = false
    const full = el.scrollHeight
    const start = from.current ?? (expanded ? { height: 0, opacity: 0 } : { height: full, opacity: 1 })
    from.current = null
    const end = expanded ? { height: full, opacity: 1 } : { height: 0, opacity: 0 }
    const timing = { duration: foldMs(Math.abs(end.height - start.height)), easing: EASE, fill: 'forwards' as const }
    el.closest<HTMLElement>('.gate-fold')?.style.setProperty('--fold-ms', `${timing.duration}ms`)
    const height = el.animate({ height: [`${start.height}px`, `${end.height}px`] }, timing)
    const fade = inner.animate({ opacity: [start.opacity, end.opacity] }, timing)
    height.onfinish = () => {
      if (!expanded) el.hidden = true
      height.cancel()
      fade.cancel()
    }
    return () => {
      if (height.playState === 'running') {
        from.current = { height: el.getBoundingClientRect().height, opacity: Number(getComputedStyle(inner).opacity) }
      }
      height.onfinish = null
      height.cancel()
      fade.cancel()
    }
  }, [expanded])

  return (
    <div ref={ref} id={id} className="gate-fold-body" hidden={!expanded}>
      <div ref={innerRef} className="gate-fold-inner">{children}</div>
    </div>
  )
}

function Row({ onClick, colour, title, detail, mono }: { onClick: () => void; colour?: string; title: string; detail: string; mono?: boolean }) {
  return (
    <button type="button" className="gate-row" onClick={onClick}>
      {colour && <span className="gate-row-bar" style={{ '--c': colour } as CSSProperties} aria-hidden="true" />}
      <span className="gate-row-txt">
        <span className={mono ? 'gate-row-t mono' : 'gate-row-t'}>{title}</span>
        <span className="gate-row-d">{detail}</span>
      </span>
      <Icon name="caret-right" />
    </button>
  )
}

/**
 * People: the bands handed over today, newest first, and everyone still to
 * collect grouped by team. A person is collected once a wristband is in the
 * ledger or queued on this phone: exactly when a scan of them turns amber
 * (gate/resolve.ts), so the two never disagree.
 *
 * Teams are roles. Nearly the whole roster is the festival's own
 * organisation, so grouping by organisation gave one group; a person from
 * any other organisation is grouped under that organisation instead.
 */
export function PeopleFolds({ roster, ledger, pending, onOpen }: {
  roster: readonly RosterRow[]
  ledger: readonly LedgerRow[]
  /** Wristbands queued on this phone: person id to when it was queued. */
  pending: ReadonlyMap<string, string>
  /** Reopen a person's scan result from their pass token. */
  onOpen: (passToken: string) => void
}) {
  const theme = useDomTheme()
  const today = useTodayIst()
  const [now] = useState(() => Date.now())
  const [team, setTeam] = useState<string | null>(null)
  const byId = new Map(roster.map((row) => [row.personId, row]))

  const issued = new Map<string, string>(pending)
  for (const row of ledger) {
    if (row.kind !== 'wristband') continue
    const at = issued.get(row.personId)
    if (at === undefined || row.occurredAt > at) issued.set(row.personId, row.occurredAt)
  }
  const recent = [...issued.entries()]
    .filter(([, at]) => istDay(at) === today)
    .sort((a, b) => b[1].localeCompare(a[1]))
    .flatMap(([personId, at]) => { const person = byId.get(personId); return person ? [{ person, at }] : [] })

  const orgCounts = new Map<string, number>()
  for (const row of roster) orgCounts.set(row.orgName, (orgCounts.get(row.orgName) ?? 0) + 1)
  const homeOrg = [...orgCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const teams = new Map<string, RosterRow[]>()
  for (const row of roster) {
    if (issued.has(row.personId)) continue
    const key = row.orgName === homeOrg ? row.roleText : row.orgName
    teams.set(key, [...(teams.get(key) ?? []), row])
  }
  // A team of one is a person, not a group: the real roster had thirteen of
  // them, which made the list longer than the search it is meant to spare.
  const OTHERS = 'Other teams'
  const grouped = [...teams.entries()].filter(([, people]) => people.length > 1).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  const singles = [...teams.entries()].filter(([, people]) => people.length === 1).flatMap(([, people]) => people).sort((a, b) => a.fullName.localeCompare(b.fullName))
  const teamList: [string, RosterRow[]][] = singles.length > 0 ? [...grouped, [OTHERS, singles]] : grouped
  const left = teamList.reduce((sum, [, people]) => sum + people.length, 0)

  const colour = (code: TierCode) => tierColour(code, theme)

  return (
    <Accordion initial="recent" folds={[
      {
        id: 'recent',
        title: 'Just now',
        count: recent.length,
        body: recent.length === 0
          ? <p className="gate-fold-empty">Bands handed over today show here. Tap one to see that person again.</p>
          : <div className="gate-rows">{recent.slice(0, 6).map(({ person, at }) => (
            <Row key={person.personId} onClick={() => onOpen(person.passToken)} colour={colour(person.typeCode)} title={person.fullName}
              detail={`${gateBandCard(person.typeCode).label} band, ${pending.has(person.personId) ? 'on this phone, ' : ''}${minutesAgo(at, now)}`} />
          ))}</div>,
      },
      {
        id: 'left',
        title: 'Still to collect',
        count: left,
        body: left === 0
          ? <p className="gate-fold-empty">Everyone on the approved list has a band.</p>
          : <div className="gate-rows">{teamList.map(([name, people]) => {
            const expanded = team === name
            return (
              <div key={name} className="gate-team">
                <button type="button" className="gate-team-h" aria-expanded={expanded} onClick={() => setTeam(expanded ? null : name)}>
                  <span>{name}</span>
                  <span className="gate-team-n">{people.length} left<Icon name={expanded ? 'caret-down' : 'caret-right'} /></span>
                </button>
                {expanded && <div className="gate-rows gate-team-people">{people.map((person) => (
                  <Row key={person.personId} onClick={() => onOpen(person.passToken)} colour={colour(person.typeCode)} title={person.fullName} detail={name === OTHERS ? `${person.orgName === homeOrg ? person.roleText : person.orgName}, ${gateBandCard(person.typeCode).label} band` : `${gateBandCard(person.typeCode).label} band`} />
                ))}</div>}
              </div>
            )
          })}</div>,
      },
    ]} />
  )
}

type Decision = { id: string; plate: string; outcome: 'cleared' | 'turned_away'; reason: string | null; occurredAt: string }
type Expected = { plate: string; stickerNo: string; holder: string | null }

/**
 * Vehicles: what this phone cleared and turned away today, and every plate
 * with a sticker that has not been cleared today. Decisions come from the
 * outbox, which keeps a row per event after it is sent; nothing else on the
 * phone records them.
 */
export function VehicleFolds({ version, onOpen }: {
  /** Bumped after each logged decision so the folds re-read the outbox. */
  version: number
  /** Fill the plate field with this registration. */
  onOpen: (plate: string) => void
}) {
  const today = useTodayIst()
  const [now] = useState(() => Date.now())
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [expected, setExpected] = useState<Expected[]>([])

  useEffect(() => {
    let live = true
    void (async () => {
      const [events, stickers, roster] = await Promise.all([
        gateDb.outbox.where('kind').equals('vehicle_event').toArray(),
        gateDb.sticker.toArray(),
        gateDb.roster.toArray(),
      ])
      const rows = events.flatMap((row): Decision[] => {
        const p = row.payload as Partial<Record<'plate' | 'outcome' | 'reason' | 'occurredAt', unknown>>
        if (typeof p.plate !== 'string' || (p.outcome !== 'cleared' && p.outcome !== 'turned_away') || typeof p.occurredAt !== 'string') return []
        if (istDay(p.occurredAt) !== today) return []
        return [{ id: row.id, plate: p.plate, outcome: p.outcome, reason: typeof p.reason === 'string' ? p.reason : null, occurredAt: p.occurredAt }]
      }).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      const clearedPlates = new Set(rows.filter((row) => row.outcome === 'cleared').map((row) => row.plate))
      const names = new Map(roster.map((row) => [row.personId, row.fullName]))
      const waiting = stickers
        .filter((row) => !clearedPlates.has(row.plate))
        .map((row) => ({ plate: row.plate, stickerNo: row.stickerNo, holder: names.get(row.personId) ?? null }))
        .sort((a, b) => a.plate.localeCompare(b.plate))
      if (!live) return
      setDecisions(rows)
      setExpected(waiting)
    })()
    return () => { live = false }
  }, [version, today])

  const cleared = decisions.filter((row) => row.outcome === 'cleared')
  const turned = decisions.filter((row) => row.outcome === 'turned_away')

  return (
    <Accordion initial="cleared" folds={[
      {
        id: 'cleared',
        title: 'Just now',
        count: cleared.length,
        body: cleared.length === 0
          ? <p className="gate-fold-empty">Vehicles you clear today show here.</p>
          : <div className="gate-rows">{cleared.slice(0, 6).map((row) => (
            <Row key={row.id} mono onClick={() => onOpen(row.plate)} colour="var(--go)" title={row.plate} detail={`Cleared ${minutesAgo(row.occurredAt, now)}`} />
          ))}</div>,
      },
      {
        id: 'turned',
        title: 'Turned away',
        count: turned.length,
        body: turned.length === 0
          ? <p className="gate-fold-empty">No vehicle turned away today.</p>
          : <div className="gate-rows">{turned.slice(0, 6).map((row) => (
            <Row key={row.id} mono onClick={() => onOpen(row.plate)} colour="var(--bad)" title={row.plate} detail={`${row.reason ?? 'Turned away'}, ${minutesAgo(row.occurredAt, now)}`} />
          ))}</div>,
      },
      {
        id: 'expected',
        title: 'Expected',
        count: expected.length,
        body: expected.length === 0
          ? <p className="gate-fold-empty">Vehicles with a sticker that have not come in today show here.</p>
          : <div className="gate-rows">{expected.map((row) => (
            <Row key={row.plate} mono onClick={() => onOpen(row.plate)} title={row.plate} detail={`${row.holder ?? 'Sticker holder'}, sticker ${row.stickerNo}`} />
          ))}</div>,
      },
    ]} />
  )
}
