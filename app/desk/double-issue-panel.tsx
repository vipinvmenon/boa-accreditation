import type { DoubleIssue } from '@/lib/schemas/dashboard'
import { tier } from '@/lib/design'
import { formatBandSerial, formatLedgerTime } from '@/lib/format'

/**
 * ACC-148 · the double-issue warning (ADR-020).
 *
 * Two offline issuers can each fasten a band on the same person; the server
 * finds it after sync and this panel lists it. Rendered only when the
 * dashboard's `doubleIssues` count is non-zero, and every value comes from
 * boa_acc_double_issues() through /api/desk/dashboard — nothing here is
 * written in. The ledger keeps both rows; the desk decides which band is the
 * spare and voids it at the gate, which appends a row (ADR-012).
 *
 * Built from the Control room's own list parts (.list, .li, .nm, .sub, .st)
 * and the existing --bad token. No new colour.
 */
export function DoubleIssuePanel({ count, list }: { count: number; list: DoubleIssue[] | null }) {
  if (count <= 0) return null
  return (
    <section aria-labelledby="double-issue-heading">
      <div className="head rv" style={{ paddingTop: '72px' }}>
        <h2 className="h2" id="double-issue-heading">
          {count} {count === 1 ? 'person holds' : 'people hold'} two live bands
        </h2>
        <span className="st no">Double issue</span>
      </div>
      <div className="bz rv"><div className="pl"><div className="list" role="list" aria-label="People holding more than one live band">
        <div className="list-head">
          <span className="mono" style={{ color: 'var(--bad)' }}>Caught after sync</span>
          <span className="mono">The ledger keeps every band. Void the spare at the gate.</span>
        </div>
        {list === null ? (
          <div className="li" role="listitem"><div className="sub">The list could not load. Reload the Control room.</div></div>
        ) : (
          list.map((person) => (
            <div className="li dbl" role="listitem" key={person.personId}>
              <div>
                <div className="nm">{person.fullName}</div>
                <div className="sub">{person.orgName}{person.typeCode ? `, ${tier(person.typeCode).label}` : ''}</div>
              </div>
              <div className="qt">
                {person.issues.map((band) => (
                  <div className="sub" key={band.checkinId}>
                    {formatBandSerial(band.bandSerial)} · {band.issuerName}
                    {band.gateLabel ? ` at ${band.gateLabel}` : ''} · {formatLedgerTime(band.occurredAt)}
                    {band.isReissue ? ' · reissue' : ''}
                  </div>
                ))}
              </div>
              <span className="st no">{person.liveBands} live bands</span>
            </div>
          ))
        )}
      </div></div></div>
    </section>
  )
}
