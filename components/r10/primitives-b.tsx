'use client'

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import { Icon } from '@/components/icon'
import { motion, useReducedMotion } from 'motion/react'

type ClassName = { className?: string }

function joinClassNames(...names: Array<string | false | undefined>) {
  return names.filter(Boolean).join(' ')
}

function usePointerSpotlight() {
  const onPointerMove = useCallback<NonNullable<HTMLAttributes<HTMLElement>['onPointerMove']>>((event) => {
    const target = event.currentTarget
    const rect = target.getBoundingClientRect()
    target.style.setProperty('--mx', `${event.clientX - rect.left}px`)
    target.style.setProperty('--my', `${event.clientY - rect.top}px`)
  }, [])
  return onPointerMove
}

export type CardProps = ClassName & {
  children?: ReactNode
  href?: string
  spotlight?: boolean
  as?: 'article' | 'div'
}

export function Card({ children, className, href, spotlight = false, as = 'article' }: CardProps) {
  const onPointerMove = usePointerSpotlight()
  const classes = joinClassNames('card', spotlight && 'spot', className)
  const content = <>{children}</>

  if (href) {
    return <motion.a className={classes} href={href} onPointerMove={spotlight ? onPointerMove : undefined} whileTap={{ scale: 0.99 }}>{content}</motion.a>
  }
  if (as === 'div') {
    return <motion.div className={classes} onPointerMove={spotlight ? onPointerMove : undefined}>{content}</motion.div>
  }
  return <motion.article className={classes} onPointerMove={spotlight ? onPointerMove : undefined}>{content}</motion.article>
}

export type SheetProps = ClassName & {
  open: boolean
  onClose: () => void
  title?: ReactNode
  /** Keep the title for screen readers only (r8-passes.html's sr-only "Pass"). */
  titleHidden?: boolean
  labelledBy?: string
  children?: ReactNode
  footer?: ReactNode
  closeLabel?: string
}

export function Sheet({
  open,
  onClose,
  title,
  titleHidden = false,
  labelledBy,
  children,
  footer,
  closeLabel = 'Close',
  className,
}: SheetProps) {
  const generatedTitleId = useId()
  const titleId = labelledBy ?? generatedTitleId
  const sheetRef = useRef<HTMLElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const [isPhone, setIsPhone] = useState(false)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)')
    const update = () => setIsPhone(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  // Callers pass inline arrows, so onClose changes on every render (every
  // keystroke in a form inside the sheet). Read it through a ref so the focus
  // effect below runs only when `open` flips, not on each re-render.
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    if (!open) {
      returnFocusRef.current?.focus()
      return
    }
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const sheet = sheetRef.current
    const focusable = () => sheet
      ? Array.from(sheet.querySelectorAll<HTMLElement>('button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true')
      : []
    const first = focusable()[0]
    // preventScroll: focusing a control inside the still-translated panel must
    // not scroll the page or force a layout mid-slide.
    first?.focus({ preventScroll: true })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const elements = focusable()
      if (elements.length === 0) {
        event.preventDefault()
        return
      }
      const current = document.activeElement
      const index = elements.indexOf(current as HTMLElement)
      const next = event.shiftKey
        ? (index <= 0 ? elements.length - 1 : index - 1)
        : (index === elements.length - 1 ? 0 : index + 1)
      if (index === -1 || (event.shiftKey && index === 0) || (!event.shiftKey && index === elements.length - 1)) {
        event.preventDefault()
        elements[next]?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <>
      <motion.div className="scrim" data-open={open ? 'true' : 'false'} aria-hidden="true" onClick={onClose} initial={false} animate={{ opacity: open ? 1 : 0 }} transition={reduceMotion ? { duration: 0 } : { duration: open ? 0.32 : 0.24, ease: 'easeOut' }} />
      <motion.aside
        ref={sheetRef}
        className={joinClassNames('sheet', className)}
        data-open={open ? 'true' : 'false'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        initial={false}
        animate={open ? { x: 0, y: 0, opacity: 1 } : { x: isPhone ? 0 : '100%', y: isPhone ? '100%' : 0, opacity: 0 }}
        transition={reduceMotion ? { duration: 0 } : open
          // Decelerate in (fast start, soft landing); leave quicker than it arrived.
          ? { x: { duration: 0.42, ease: [0.22, 1, 0.36, 1] }, y: { duration: 0.42, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.22, ease: 'easeOut' } }
          : { x: { duration: 0.3, ease: [0.4, 0, 0.9, 0.6] }, y: { duration: 0.3, ease: [0.4, 0, 0.9, 0.6] }, opacity: { duration: 0.24, delay: 0.06, ease: 'easeIn' } }}
        drag={open && isPhone ? 'y' : false}
        dragConstraints={{ top: 0 }}
        dragElastic={0.18}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120 || info.velocity.y > 600) onClose()
        }}
      >
        <div className="grabber" aria-hidden="true" />
        <div className="sheet-head">
          {titleHidden
            ? title && <h2 id={titleId} className="sr">{title}</h2>
            : <div>{title && <h2 id={titleId} className="display-md">{title}</h2>}</div>}
          <button type="button" className="sheet-close" aria-label={closeLabel} onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </motion.aside>
    </>
  )
}

export type TableColumn = {
  key: string
  label: ReactNode
  className?: string
}

export type TableProps = ClassName & {
  columns: TableColumn[]
  children?: ReactNode
  label: string
  ariaOnlyHeader?: boolean
}

export function Table({ columns, children, label, ariaOnlyHeader = false, className }: TableProps) {
  return (
    <div className={joinClassNames('table', className)} role="table" aria-label={label}>
      <div className={joinClassNames('thead', ariaOnlyHeader && 'sr-only')} role="row">
        {columns.map((column) => <span key={column.key} className={column.className} role="columnheader">{column.label}</span>)}
      </div>
      {children}
    </div>
  )
}

export type TableRowProps = ClassName & {
  children?: ReactNode
  onClick?: () => void
}

export function TableRow({ children, className, onClick }: TableRowProps) {
  return <div className={joinClassNames('tr', className)} role="row" onClick={onClick}>{children}</div>
}

export function TableCell({ children, className }: ClassName & { children?: ReactNode }) {
  return <div className={className} role="cell">{children}</div>
}

export type EmptyStateProps = ClassName & {
  title: ReactNode
  children?: ReactNode
  icon?: ReactNode
  error?: boolean
  /** A button under the text. Never put one in `children`: that is a paragraph, and the button would sit inline after the last word. */
  action?: ReactNode
}

export function EmptyState({ title, children, icon, error = false, action, className }: EmptyStateProps) {
  return (
    <section className={joinClassNames('empty', error && 'empty-error', className)} role={error ? 'alert' : undefined}>
      {icon && <span aria-hidden="true">{icon}</span>}
      <h2 className="display-sm">{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </section>
  )
}

/**
 * `text` stands in for a value inside the element that will hold it: a
 * cap-height bar on the baseline, sized in `ch` of that element's own font,
 * so the line box — and everything below it — is the same height before and
 * after the data lands. Prefer it to a free-standing `line` wherever the real
 * element can be rendered around it.
 */
export type SkeletonShape = 'line' | 'text' | 'btn' | 'num' | 'pill' | 'dot' | 'sq' | 'hero'

export function Skeleton({ shape = 'line', className, style }: ClassName & { shape?: SkeletonShape; style?: CSSProperties }) {
  return <span className={joinClassNames('sk', `sk-${shape}`, className)} aria-hidden="true" style={style} />
}

/** A value still loading, inside the element that will hold it: `w` is its width in `ch` (or any CSS length) of that element's font. */
export function SkeletonText({ w }: { w: string }) {
  return <Skeleton shape="text" style={{ '--sk-w': w } as CSSProperties} />
}

export type ToastProps = ClassName & {
  open?: boolean
  message: ReactNode
  onDismiss?: () => void
  error?: boolean
  duration?: number
  icon?: ReactNode
}

export function Toast({ open = true, message, onDismiss, error = false, duration = 4000, icon, className }: ToastProps) {
  const reduceMotion = useReducedMotion()
  useEffect(() => {
    if (!open || !onDismiss || duration <= 0) return
    const timer = window.setTimeout(onDismiss, duration)
    return () => window.clearTimeout(timer)
  }, [duration, onDismiss, open])

  if (!open) return null
  return (
    <motion.div
      className={joinClassNames('toast', error && 'bad', className)}
      role={error ? 'alert' : 'status'}
      aria-live={error ? 'assertive' : 'polite'}
      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      <span>{message}</span>
      {onDismiss && <button type="button" className="sheet-close" aria-label="Dismiss notification" onClick={onDismiss}>×</button>}
    </motion.div>
  )
}

export type CountUpProps = ClassName & {
  to: number
  duration?: number
  format?: (value: number) => string
}

export function CountUp({ to, duration = 900, format = (value) => Math.round(value).toLocaleString('en-IN'), className }: CountUpProps) {
  const [value, setValue] = useState(0)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (reduceMotion) {
      return
    }
    const started = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration)
      setValue(to * (1 - (1 - progress) ** 4))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [duration, reduceMotion, to])

  return <motion.span className={className} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduceMotion ? 0 : 0.22 }}>{format(reduceMotion ? to : value)}</motion.span>
}
