'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useId,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'

type ClassName = { className?: string }

function joinClassNames(...names: Array<string | false | undefined>) {
  return names.filter(Boolean).join(' ')
}

export type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost' | 'sm' | 'gate' | 'block' | 'link'

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> &
  ClassName & {
    variant?: ButtonVariant
    /**
     * A trailing icon, wrapped in the mock's circular `.ic` badge
     * (design/source/r10/r8/ui.css:108-110) rather than sitting bare next to
     * the label. Pass an <Icon /> here instead of adding it to `children`.
     */
    icon?: ReactNode
  }

export function Button({ variant = 'default', className, type = 'button', icon, children, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={joinClassNames('btn', variant === 'default' ? undefined : `btn-${variant}`, className)}
    >
      {children}
      {icon !== undefined && <span className="ic" aria-hidden="true">{icon}</span>}
    </button>
  )
}

export type HoldButtonProps = Omit<ButtonProps, 'onClick'> & {
  duration?: number
  onComplete?: () => void
  onDone?: () => void
}

export function HoldButton({
  duration = 700,
  onComplete,
  onDone,
  children,
  className,
  disabled,
  ...props
}: HoldButtonProps) {
  const [holding, setHolding] = useState(false)
  const [progress, setProgress] = useState(0)
  const [motionAllowed, setMotionAllowed] = useState(true)
  const startedAt = useRef<number | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const completed = useRef(false)

  const stop = useCallback((complete: boolean) => {
    if (timer.current !== null) {
      clearInterval(timer.current)
      timer.current = null
    }
    startedAt.current = null
    setHolding(false)
    setProgress(complete ? 1 : 0)
    if (complete && !completed.current) {
      completed.current = true
      onComplete?.()
      onDone?.()
    }
  }, [onComplete, onDone])

  const start = useCallback(() => {
    if (disabled || holding) return
    completed.current = false
    startedAt.current = Date.now()
    setHolding(true)
    setProgress(0)
    timer.current = setInterval(() => {
      const began = startedAt.current
      if (began === null) return
      const next = Math.min(1, (Date.now() - began) / duration)
      if (motionAllowed) setProgress(next)
      if (next >= 1) stop(true)
    }, 16)
  }, [disabled, duration, holding, motionAllowed, stop])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setMotionAllowed(!media.matches)
    const cancelOnWindowBlur = () => stop(false)
    update()
    media.addEventListener('change', update)
    window.addEventListener('blur', cancelOnWindowBlur)
    return () => {
      media.removeEventListener('change', update)
      window.removeEventListener('blur', cancelOnWindowBlur)
      if (timer.current !== null) clearInterval(timer.current)
    }
  }, [stop])

  return (
    <Button
      {...props}
      className={joinClassNames('hold', className)}
      disabled={disabled}
      aria-label={props['aria-label']}
      aria-pressed={holding}
      data-holding={holding ? 'true' : undefined}
      style={{ ...props.style, '--p': progress } as CSSProperties}
      onPointerDown={(event) => {
        props.onPointerDown?.(event)
        if (!event.defaultPrevented) {
          event.currentTarget.setPointerCapture?.(event.pointerId)
          start()
        }
      }}
      onPointerUp={(event) => {
        props.onPointerUp?.(event)
        if (!event.defaultPrevented) stop(progress >= 1)
      }}
      onPointerCancel={(event) => {
        props.onPointerCancel?.(event)
        stop(false)
      }}
      onBlur={(event) => {
        props.onBlur?.(event)
        if (!event.defaultPrevented) stop(false)
      }}
      onKeyDown={(event) => {
        props.onKeyDown?.(event)
        if (!event.defaultPrevented && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          start()
        }
      }}
      onKeyUp={(event) => {
        props.onKeyUp?.(event)
        if (event.key === 'Enter' || event.key === ' ') stop(progress >= 1)
      }}
    >
      <span className="hold-fill" aria-hidden="true" />
      <span className="hold-label">{children}</span>
    </Button>
  )
}

export type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> &
  ClassName & {
    label?: ReactNode
    hint?: ReactNode
    error?: ReactNode
    inputClassName?: string
  }

export function Field({ label, hint, error, id, className, inputClassName, 'aria-invalid': ariaInvalid, 'aria-describedby': ariaDescribedBy, ...inputProps }: FieldProps) {
  const generatedId = useId()
  const controlId = id ?? `${generatedId}-control`
  const message = error !== undefined ? error : hint
  const messageId = message !== undefined ? `${controlId}-${error !== undefined ? 'error' : 'hint'}` : undefined
  const describedBy = [ariaDescribedBy, messageId].filter(Boolean).join(' ') || undefined
  const invalid = ariaInvalid ?? (error ? true : undefined)
  return (
    <label className={joinClassNames('field', className)} htmlFor={controlId}>
      {label !== undefined && <span>{label}</span>}
      <input {...inputProps} id={controlId} className={joinClassNames('input', inputClassName)} aria-invalid={invalid} aria-describedby={describedBy} />
      {error !== undefined ? <span id={messageId} className="error" role="alert">{error}</span> : hint !== undefined ? <span id={messageId} className="hint">{hint}</span> : null}
    </label>
  )
}

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> &
  ClassName & {
    label?: ReactNode
    hint?: ReactNode
    error?: ReactNode
    inputClassName?: string
  }

export function Select({ label, hint, error, id, className, inputClassName, 'aria-invalid': ariaInvalid, 'aria-describedby': ariaDescribedBy, children, ...selectProps }: SelectProps) {
  const generatedId = useId()
  const controlId = id ?? `${generatedId}-control`
  const message = error !== undefined ? error : hint
  const messageId = message !== undefined ? `${controlId}-${error !== undefined ? 'error' : 'hint'}` : undefined
  const describedBy = [ariaDescribedBy, messageId].filter(Boolean).join(' ') || undefined
  const invalid = ariaInvalid ?? (error ? true : undefined)
  return (
    <label className={joinClassNames('field', className)} htmlFor={controlId}>
      {label !== undefined && <span>{label}</span>}
      <span className="select">
        <select {...selectProps} id={controlId} className={joinClassNames('input', inputClassName)} aria-invalid={invalid} aria-describedby={describedBy}>
          {children}
        </select>
      </span>
      {error !== undefined ? <span id={messageId} className="error" role="alert">{error}</span> : hint !== undefined ? <span id={messageId} className="hint">{hint}</span> : null}
    </label>
  )
}

export type ChipProps = ClassName & {
  children?: ReactNode
  onEdit?: () => void
  onActivate?: () => void
  onRemove?: () => void
  removeLabel?: string
  preset?: boolean
  count?: ReactNode
}

export function Chip({ children, onEdit, onActivate, onRemove, removeLabel = 'Remove filter', preset = false, count, className }: ChipProps) {
  if (preset) {
    return (
      <button type="button" className={joinClassNames('chip', 'chip-preset', className)} onClick={onActivate}>
        {children}
        {count !== undefined && <CountDot>{count}</CountDot>}
      </button>
    )
  }

  return (
    <span className={joinClassNames('chip', className)}>
      {onEdit ? (
        <button type="button" className="chip-edit" onClick={onEdit}>{children}</button>
      ) : (
        <span className="chip-edit">{children}</span>
      )}
      {count !== undefined && <CountDot>{count}</CountDot>}
      {onRemove && (
        <button type="button" className="chip-x" aria-label={removeLabel} onClick={onRemove}>
          <span aria-hidden="true">×</span>
        </button>
      )}
    </span>
  )
}

export type FilterChip = {
  id: string
  label: ReactNode
  onRemove: () => void
  removeLabel?: string
}

export type FilterBarProps = ClassName & {
  children?: ReactNode
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  searchLabel?: string
  activeFilters?: FilterChip[]
  onClearAll?: () => void
  resultCount?: ReactNode
}

export function FilterBar({
  children,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Name or organisation',
  searchLabel = 'Search',
  activeFilters = [],
  onClearAll,
  resultCount,
  className,
}: FilterBarProps) {
  const hasSearch = onSearchChange !== undefined
  const searchRef = useRef<HTMLInputElement>(null)

  // r10-foundation: the mock's search field always carries a `/` shortcut
  // hint and a matching global listener (design/source/r10/r8-master.html:49,
  // 213; design/source/r10/r8/ui.css:161). Skip when focus is already in a
  // text field so `/` still types normally there.
  useEffect(() => {
    if (!hasSearch) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return
      event.preventDefault()
      searchRef.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [hasSearch])

  return (
    <div className={joinClassNames('filterbar', className)} role="search">
      <div className="filterbar-row">
        {hasSearch && (
          <label className="search">
            <span className="sr-only">{searchLabel}</span>
            <input
              ref={searchRef}
              className="input"
              type="search"
              value={searchValue ?? ''}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchLabel}
            />
            <kbd aria-hidden="true">/</kbd>
          </label>
        )}
        {children}
      </div>
      {(activeFilters.length > 0 || resultCount !== undefined) && (
        <div className="filterbar-row">
          <div className="chips" aria-live="polite">
            {activeFilters.map((filter) => (
              <Chip
                key={filter.id}
                onRemove={filter.onRemove}
                {...(filter.removeLabel ? { removeLabel: filter.removeLabel } : {})}
              >
                {filter.label}
              </Chip>
            ))}
            {activeFilters.length > 0 && onClearAll && (
              <button type="button" className="btn-link" onClick={onClearAll}>Clear all</button>
            )}
          </div>
          {resultCount !== undefined && <span className="count body-sm">{resultCount}</span>}
        </div>
      )}
    </div>
  )
}

export type StatusPillProps = ClassName & {
  status?: 'ok' | 'wait' | 'bad' | 'mute'
  children?: ReactNode
}

export function StatusPill({ status = 'mute', children, className }: StatusPillProps) {
  return <span className={joinClassNames('pill', `pill-${status}`, className)}>{children}</span>
}

export type CountDotProps = ClassName & {
  children?: ReactNode
  label?: string
}

export function CountDot({ children, label, className }: CountDotProps) {
  return <span className={joinClassNames('count-dot', className)} aria-label={label}>{children}</span>
}
