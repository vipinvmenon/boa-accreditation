import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  Button,
  Chip,
  CountDot,
  Field,
  FilterBar,
  HoldButton,
  Select,
  StatusPill,
} from '@/components/r10'

describe('r10 primitives A', () => {
  it('cancels a hold when the control loses focus', () => {
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../components/r10/primitives-a.tsx'), 'utf8')
    expect(source).toContain('onBlur={(event) => {')
    expect(source).toContain("window.addEventListener('blur', cancelOnWindowBlur)")
    expect(source).toContain('if (!event.defaultPrevented) stop(false)')
  })

  it('expands chip edit controls to the tokenized hit area', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../app/r10/primitives.css'), 'utf8')
    expect(css).toContain('inset: calc((var(--h-chip) - var(--hit)) / 2) calc(var(--s-1) * -1)')
  })

  it('renders Button variants and disabled state', () => {
    const markup = renderToStaticMarkup(createElement(
      Fragment,
      null,
      createElement(Button, { variant: 'primary' }, 'Approve'),
      createElement(Button, { variant: 'danger', disabled: true }, 'Void'),
      createElement(Button, { variant: 'link' }, 'Details'),
    ))
    expect(markup).toContain('class="btn btn-primary"')
    expect(markup).toContain('disabled="" type="button" class="btn btn-danger"')
    expect(markup).toContain('class="btn btn-link"')
    expect(markup).toContain('type="button"')
  })

  it('renders HoldButton progress structure and accessible pressed state', () => {
    const markup = renderToStaticMarkup(createElement(HoldButton, { onComplete: vi.fn() }, 'Hold to void'))
    expect(markup).toContain('class="btn hold"')
    expect(markup).toContain('class="hold-fill"')
    expect(markup).toContain('class="hold-label"')
    expect(markup).toContain('aria-pressed="false"')
  })

  it('associates Field error content with the input', () => {
    const markup = renderToStaticMarkup(createElement(Field, {
      id: 'phone',
      label: 'Phone',
      error: 'Enter a valid phone number.',
      defaultValue: '9000',
    }))
    expect(markup).toContain('class="field"')
    expect(markup).toContain('class="input"')
    expect(markup).toContain('aria-invalid="true"')
    expect(markup).toContain('aria-describedby="phone-error"')
    expect(markup).toContain('id="phone-error"')
    expect(markup).toContain('role="alert"')
  })

  it('associates Select hint content with the control', () => {
    const markup = renderToStaticMarkup(createElement(
      Select,
      { id: 'role', label: 'Role', hint: 'Choose the access level.', defaultValue: 'issuer' },
      createElement('option', { value: 'issuer' }, 'Issuer'),
    ))
    expect(markup).toContain('class="select"')
    expect(markup).toContain('class="input"')
    expect(markup).toContain('aria-describedby="role-hint"')
    expect(markup).toContain('id="role-hint"')
    expect(markup).toContain('value="issuer"')
  })

  it('renders removable and keyboard-actionable preset Chips', () => {
    const markup = renderToStaticMarkup(createElement(
      Fragment,
      null,
      createElement(Chip, { onEdit: vi.fn(), onRemove: vi.fn(), removeLabel: 'Remove tier' }, 'Tier: Crew'),
      createElement(Chip, { preset: true, onActivate: vi.fn(), count: 17 }, 'Not in BMS'),
    ))
    expect(markup).toContain('class="chip"')
    expect(markup).toContain('class="chip-edit"')
    expect(markup).toContain('aria-label="Remove tier"')
    expect(markup).toContain('type="button" class="chip chip-preset"')
    expect(markup).toContain('class="count-dot"')
    expect(markup).not.toContain('class="chip chip-preset"><span')
  })

  it('renders FilterBar active chips and clear-all control', () => {
    const markup = renderToStaticMarkup(createElement(FilterBar, {
      searchValue: 'aarav',
      onSearchChange: vi.fn(),
      activeFilters: [{ id: 'tier', label: 'Tier: Crew', onRemove: vi.fn() }],
      onClearAll: vi.fn(),
      resultCount: createElement(Fragment, null, createElement('strong', null, '1'), ' of 20'),
    }))
    expect(markup).toContain('role="search"')
    expect(markup).toContain('type="search"')
    expect(markup).toContain('Tier: Crew')
    expect(markup).toContain('>Clear all</button>')
    expect(markup).toContain('<strong>1</strong> of 20')
  })

  it('always renders StatusPill with a status class and CountDot with a label', () => {
    const markup = renderToStaticMarkup(createElement(
      Fragment,
      null,
      createElement(StatusPill, { status: 'ok' }, 'In BMS'),
      createElement(CountDot, { label: 'People not collected' }, '17'),
    ))
    expect(markup).toContain('class="pill pill-ok"')
    expect(markup).toContain('class="count-dot"')
    expect(markup).toContain('aria-label="People not collected"')
  })
})
