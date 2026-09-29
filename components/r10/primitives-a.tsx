'use client'

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  useId,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import { Icon } from '@/components/icon'

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

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'value' | 'defaultValue' | 'onChange'> &
  ClassName & {
    label?: ReactNode
    hint?: ReactNode
    error?: ReactNode
    inputClassName?: string
    value?: string
    defaultValue?: string
    onChange?: (event: { target: { value: string } }) => void
  }

type SelectOption = { value: string; label: ReactNode; text: string; disabled: boolean }

function readOptions(children: ReactNode): SelectOption[] {
  const options: SelectOption[] = []
  Children.forEach(children, (child) => {
    if (!isValidElement<{ value?: string | number; disabled?: boolean; children?: ReactNode }>(child) || child.type !== 'option') return
    const label = child.props.children
    options.push({
      value: String(child.props.value ?? ''),
      label,
      text: typeof label === 'string' ? label : String(child.props.value ?? ''),
      disabled: Boolean(child.props.disabled),
    })
  })
  return options
}

/**
 * A styled listbox in place of the browser's <select>: the native popup is
 * drawn by the OS and ignores the design system. Same props as before — the
 * <option> children, `value`/`defaultValue`, and `onChange` (event.target.value).
 * Focus stays on the trigger (select-only combobox pattern).
 */
export function Select({ label, hint, error, id, className, inputClassName, 'aria-invalid': ariaInvalid, 'aria-describedby': ariaDescribedBy, children, value, defaultValue, onChange, name, disabled }: SelectProps) {
  const generatedId = useId()
  const controlId = id ?? `${generatedId}-control`
  const listId = `${controlId}-list`
  const labelId = `${controlId}-label`
  const message = error !== undefined ? error : hint
  const messageId = message !== undefined ? `${controlId}-${error !== undefined ? 'error' : 'hint'}` : undefined
  const describedBy = [ariaDescribedBy, messageId].filter(Boolean).join(' ') || undefined
  const invalid = ariaInvalid ?? (error ? true : undefined)

  const options = readOptions(children)
  const [inner, setInner] = useState(defaultValue ?? options[0]?.value ?? '')
  const current = value ?? inner
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === current))
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(selectedIndex)
  const rootRef = useRef<HTMLSpanElement>(null)
  const typeahead = useRef({ text: '', at: 0 })

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function openList() {
    setActive(selectedIndex)
    setOpen(true)
  }

  function choose(index: number) {
    const option = options[index]
    if (!option || option.disabled) return
    setInner(option.value)
    if (option.value !== current) onChange?.({ target: { value: option.value } })
    setOpen(false)
  }

  function step(from: number, direction: 1 | -1) {
    for (let i = from + direction; i >= 0 && i < options.length; i += direction) if (!options[i]?.disabled) return i
    return from
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    const key = event.key
    if (key === 'Tab') { setOpen(false); return }
    if (key === 'Escape') {
      if (open) { event.preventDefault(); event.stopPropagation(); event.nativeEvent.stopImmediatePropagation(); setOpen(false) }
      return
    }
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault()
      if (!open) { openList(); return }
      setActive((index) => step(index, key === 'ArrowDown' ? 1 : -1))
    } else if (key === 'Home' || key === 'End') {
      event.preventDefault()
      if (!open) openList()
      setActive(key === 'Home' ? step(-1, 1) : step(options.length, -1))
    } else if (key === 'Enter' || key === ' ') {
      event.preventDefault()
      if (open) choose(active); else openList()
    } else if (key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const now = Date.now()
      const text = (now - typeahead.current.at < 700 ? typeahead.current.text : '') + key.toLowerCase()
      typeahead.current = { text, at: now }
      const hit = options.findIndex((option) => !option.disabled && option.text.toLowerCase().startsWith(text))
      if (hit >= 0) { if (!open) openList(); setActive(hit) }
    }
  }

  return (
    <div className={joinClassNames('field', className)}>
      {label !== undefined && <span id={labelId} onClick={() => document.getElementById(controlId)?.focus()}>{label}</span>}
      <span className="select" ref={rootRef} data-open={open ? 'true' : 'false'}>
        <button
          type="button"
          id={controlId}
          role="combobox"
          className={joinClassNames('input', 'select-trigger', inputClassName)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-labelledby={label !== undefined ? labelId : undefined}
          aria-activedescendant={open ? `${controlId}-opt-${active}` : undefined}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : openList())}
          onKeyDown={onKeyDown}
        >
          {options[selectedIndex]?.label}
        </button>
        {name !== undefined && <input type="hidden" name={name} value={current} />}
        {open && (
          <div className="select-list" role="listbox" id={listId} aria-labelledby={label !== undefined ? labelId : undefined}>
            {options.map((option, index) => (
              <div
                key={option.value}
                id={`${controlId}-opt-${index}`}
                role="option"
                className="select-option"
                aria-selected={option.value === current}
                aria-disabled={option.disabled || undefined}
                data-active={index === active ? 'true' : undefined}
                onPointerMove={() => { if (!option.disabled && index !== active) setActive(index) }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(index)}
              >
                <span>{option.label}</span>
                {option.value === current && <Icon name="check" />}
              </div>
            ))}
          </div>
        )}
      </span>
      {error !== undefined ? <span id={messageId} className="error" role="alert">{error}</span> : hint !== undefined ? <span id={messageId} className="hint">{hint}</span> : null}
    </div>
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
            <span className="ph" aria-hidden="true"><Icon name="magnifying-glass" /></span>
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
