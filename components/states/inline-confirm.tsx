/**
 * ACC-125: the inline confirm for a destructive action (Deactivate, a
 * WhatsApp resend) — never a browser `confirm()`, which is unstyled, blocks
 * the render thread, and reads nothing to a screen reader beyond the raw
 * string. Swaps the triggering control for a question plus Confirm/Cancel,
 * in place, so the operator never loses their position on the screen.
 */
export function InlineConfirm({
  prompt,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  busy = false,
  busyLabel,
  onConfirm,
  onCancel,
  tone = 'bad',
  className = '',
}: {
  prompt: string
  confirmLabel?: string
  cancelLabel?: string
  busy?: boolean
  busyLabel?: string
  onConfirm: () => void
  onCancel: () => void
  tone?: 'bad' | 'grn'
  className?: string
}) {
  return (
    <div className={`inline-confirm ${className}`.trim()} role="group" aria-label={prompt}>
      <span className="inline-confirm-prompt">{prompt}</span>
      <button
        type="button"
        className={`btn solo ${tone === 'bad' ? 'bad hov-fill-bad' : 'hov-fill-grn'}`}
        disabled={busy}
        onClick={onConfirm}
      >
        {busy ? (busyLabel ?? 'Working…') : confirmLabel}
      </button>
      <button type="button" className="btn solo" disabled={busy} onClick={onCancel}>
        {cancelLabel}
      </button>
    </div>
  )
}
