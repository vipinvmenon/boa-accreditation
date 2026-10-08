import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  Card,
  CountUp,
  EmptyState,
  Sheet,
  Skeleton,
  Table,
  TableCell,
  TableRow,
  Toast,
} from '@/components/r10'

describe('r10 primitives B', () => {
  it('renders a card spotlight variant and preserves linked-card semantics', () => {
    const markup = renderToStaticMarkup(createElement(Card, { href: '/desk/master', spotlight: true }, 'Master list'))
    expect(markup).toContain('class="card spot"')
    expect(markup).toContain('href="/desk/master"')
  })

  it('renders an accessible open sheet with its glass structure', () => {
    const markup = renderToStaticMarkup(createElement(Sheet, {
      open: true,
      onClose: vi.fn(),
      title: 'Aarav Rao',
    }, createElement('p', null, 'Accreditation details')))
    expect(markup).toContain('role="dialog"')
    expect(markup).toContain('aria-modal="true"')
    expect(markup).toContain('class="sheet-body"')
    expect(markup).toContain('class="grabber"')
  })

  it('renders table semantics with named columns and cells', () => {
    const markup = renderToStaticMarkup(createElement(Table, {
      label: 'Showing 1 of 1 people',
      columns: [{ key: 'person', label: 'Person' }, { key: 'status', label: 'Status' }],
    }, createElement(TableRow, null,
      createElement(TableCell, null, 'Aarav Rao'),
      createElement(TableCell, null, 'Collected'),
    )))
    expect(markup).toContain('role="table"')
    expect(markup).toContain('aria-label="Showing 1 of 1 people"')
    expect(markup).toContain('role="columnheader"')
    expect(markup).toContain('role="cell"')
  })

  it('puts an empty state\'s action below its text, not inside the paragraph', () => {
    const markup = renderToStaticMarkup(
      createElement(EmptyState, { title: 'No one matches', action: createElement('button', null, 'Clear filters') }, 'Remove a filter.'),
    )
    expect(markup).toContain('<p>Remove a filter.</p><button>Clear filters</button>')
  })

  it('renders empty, widget-shaped skeletons, toast, and count-up', () => {
    const markup = renderToStaticMarkup(createElement(Fragment, null,
      createElement(EmptyState, { title: 'No one approved yet' }, 'People appear here as soon as they are approved.'),
      createElement(Skeleton, { shape: 'pill' }),
      createElement(Skeleton, { shape: 'hero' }),
      createElement(Toast, { message: 'Phone number copied' }),
      createElement(CountUp, { to: 428, className: 'count-dot' }),
    ))
    expect(markup).toContain('class="empty"')
    expect(markup).toContain('class="sk sk-pill"')
    expect(markup).toContain('class="sk sk-hero"')
    expect(markup).toContain('role="status"')
    expect(markup).toContain('class="count')
  })
})
