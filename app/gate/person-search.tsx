'use client'

/**
 * ACC-147 / ACC-131 — "Can't scan? Search by name".
 *
 * Searches only the roster the gate screen already read from Dexie (no fetch,
 * no fast path — non-negotiable #7). Picking a person hands the parent the
 * same `BOA26:<token>` payload the camera would have decoded, so the rest of
 * the flow (green/amber/red, typed serial, outbox) is the scanner's, unchanged.
 * Shows name, org, role, band and — if the cache ever carries one — a phone
 * masked to its last four digits (non-negotiable #9).
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { gateBandCard } from '@/gate/band-card'
import {
  buildSearchIndex,
  maskPhone,
  DEFAULT_RESULT_LIMIT,
  MIN_NAME_QUERY,
  MIN_PHONE_DIGITS,
  passPayload,
  searchPeople,
  type SearchableRow,
} from '@/gate/search'
import { Icon } from '@/components/icon'

type Props = {
  roster: readonly SearchableRow[]
  /** Receives the scanner payload for the chosen person. */
  onPick: (payload: string) => void
  onOpen?: () => void
  /** Fires on every way this panel closes: Escape, "Back to scanning", or a pick. */
  onClose?: () => void
}

export function PersonSearch({ roster, onPick, onOpen, onClose }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const openerRef = useRef<HTMLButtonElement>(null)
  const id = useId()
  const listId = `${id}-results`
  const hintId = `${id}-hint`

  const index = useMemo(() => buildSearchIndex(roster), [roster])
  const hasPhones = useMemo(() => roster.some((row) => Boolean(row.phone)), [roster])
  const matches = useMemo(() => searchPeople(index, query), [index, query])
  const activeIndex = Math.min(active, Math.max(matches.length - 1, 0))

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const close = () => {
    setOpen(false)
    setQuery('')
    setActive(0)
    onClose?.()
  }

  const pick = (row: SearchableRow) => {
    close()
    onPick(passPayload(row.passToken))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && matches.length > 0) {
      event.preventDefault()
      setActive((activeIndex + 1) % matches.length)
    } else if (event.key === 'ArrowUp' && matches.length > 0) {
      event.preventDefault()
      setActive((activeIndex - 1 + matches.length) % matches.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const chosen = matches[activeIndex]
      if (chosen) pick(chosen.row)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close()
      openerRef.current?.focus()
    }
  }

  const trimmed = query.trim()
  const status =
    trimmed.length === 0
      ? hasPhones
        ? `Type ${MIN_NAME_QUERY}+ letters of a name, or the last ${MIN_PHONE_DIGITS} digits of a phone.`
        : `Type ${MIN_NAME_QUERY}+ letters of a name.`
      : matches.length === 0
        ? 'No approved person matches that search.'
        : `${matches.length} match${matches.length === 1 ? '' : 'es'}${matches.length === DEFAULT_RESULT_LIMIT ? `, showing the first ${DEFAULT_RESULT_LIMIT}` : ''}. Pick one to check them in.`

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen(true)
          onOpen?.()
        }}
        className="btn wide hov-outline-grn"
      >
        Can&apos;t scan? Search by name<span className="ic"><Icon name="magnifying-glass" /></span>
      </button>
      {open && (
        <div className="name-search">
          <label className="field">
            <span>Search approved list</span>
            <input
              ref={inputRef}
              type="search"
              role="combobox"
              aria-expanded={matches.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={matches.length > 0 ? `${listId}-${activeIndex}` : undefined}
              aria-describedby={hintId}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setActive(0)
              }}
              onKeyDown={onKeyDown}
              placeholder={hasPhones ? 'Name or last 4 of phone' : 'Name'}
            />
          </label>
          <p id={hintId} className="mono" role="status" aria-live="polite">{status}</p>
          <div id={listId} role="listbox" aria-label="Matching people" className="name-search-results" hidden={matches.length === 0}>
            {matches.map(({ row }, position) => (
              <div
                key={row.passToken}
                id={`${listId}-${position}`}
                role="option"
                aria-selected={position === activeIndex}
                tabIndex={-1}
                className="name-search-result"
                // Keep focus in the input so the keyboard flow is not broken by a tap.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(position)}
                onClick={() => pick(row)}
              >
                <span>
                  <b>{row.fullName}</b>
                  <small>
                    {row.orgName} · {row.roleText} · {gateBandCard(row.typeCode).label}
                    {row.phone ? ` · ${maskPhone(row.phone)}` : ''}
                  </small>
                </span>
                <Icon name="arrow-right" />
              </div>
            ))}
          </div>
          <button type="button" className="btn wide" onClick={() => { close(); openerRef.current?.focus() }}>Back to scanning</button>
        </div>
      )}
    </>
  )
}
