/**
 * The v2 skeleton bar (`.skeleton` in app/v2.css), used by the desk chrome's
 * profile block and the sign-in form. r10 screens use `Skeleton` from
 * components/r10 instead.
 */
export type SkeletonProps = {
  className?: string
  width?: string
}

export function Skeleton({ className = '', width }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={`skeleton ${className}`.trim()}
      style={width ? { width } : undefined}
    />
  )
}
