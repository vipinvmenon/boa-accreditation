/**
 * The one skeleton primitive every desk screen builds its loading state from
 * (components/loading-skeleton.tsx's per-screen compositions render one of
 * these per placeholder). Kept here, under components/states/, as the ACC-122
 * home for the three loading/empty/error building blocks — loading-skeleton.tsx
 * re-exports this under its old name so the existing per-screen compositions
 * did not need to change.
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
