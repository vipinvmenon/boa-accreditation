type LoadingSkeletonProps = {
  className?: string
  width?: string
}

export function LoadingSkeleton({ className = '', width }: LoadingSkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={`skeleton ${className}`.trim()}
      style={width ? { width } : undefined}
    />
  )
}

export function ScreenSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="screen-skeleton" aria-label="Loading content">
      <LoadingSkeleton className="screen-skeleton-kicker" width="96px" />
      <LoadingSkeleton className="screen-skeleton-title" width="min(360px, 70%)" />
      <div className="screen-skeleton-card">
        {Array.from({ length: rows }, (_, index) => (
          <div className="screen-skeleton-row" key={index}>
            <LoadingSkeleton width={index === 0 ? '42%' : '68%'} />
            <LoadingSkeleton width={index === 0 ? '22%' : '34%'} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function ControlRoomSkeleton() {
  const stats = ['approved', 'bands', 'vehicle', 'bms', 'aaa', 'orgs']

  return (
    <div className="control-skeleton" aria-label="Loading control room">
      <div className="control-skeleton-bento">
        <div className="control-skeleton-hero">
          <LoadingSkeleton width="110px" />
          <LoadingSkeleton className="control-skeleton-hero-title" width="62%" />
          <LoadingSkeleton width="180px" />
          <div className="control-skeleton-actions">
            <LoadingSkeleton width="154px" />
            <LoadingSkeleton width="178px" />
          </div>
        </div>
        {stats.map((stat) => (
          <div className={`control-skeleton-stat control-skeleton-stat-${stat}`} key={stat}>
            <LoadingSkeleton width={stat === 'aaa' ? '54%' : '46%'} />
            <LoadingSkeleton className="control-skeleton-stat-value" width={stat === 'vehicle' ? '48%' : '35%'} />
            <LoadingSkeleton width="76%" />
            <LoadingSkeleton className="control-skeleton-meter" width="100%" />
          </div>
        ))}
      </div>
      <div className="control-skeleton-bands">
        <LoadingSkeleton className="control-skeleton-section-label" width="146px" />
        <LoadingSkeleton className="control-skeleton-section-title" width="290px" />
        {Array.from({ length: 3 }, (_, index) => (
          <div className="control-skeleton-band" key={index}>
            <LoadingSkeleton width="38%" />
            <LoadingSkeleton className="control-skeleton-stripe" />
            <LoadingSkeleton width="64%" />
            <LoadingSkeleton width="88%" />
            <div className="control-skeleton-zones">
              {Array.from({ length: 4 }, (_, zone) => <LoadingSkeleton key={zone} width={zone % 2 ? '24%' : '18%'} />)}
            </div>
          </div>
        ))}
      </div>
      <div className="control-skeleton-orgs">
        <LoadingSkeleton className="control-skeleton-section-label" width="150px" />
        <LoadingSkeleton className="control-skeleton-section-title" width="260px" />
        <div className="control-skeleton-list">
          <div className="control-skeleton-list-head">
            <LoadingSkeleton width="150px" />
            <LoadingSkeleton width="62px" />
          </div>
          {Array.from({ length: 4 }, (_, index) => (
            <div className="control-skeleton-list-row" key={index}>
              <div>
                <LoadingSkeleton width={index === 0 ? '180px' : '150px'} />
                <LoadingSkeleton className="control-skeleton-subline" width="128px" />
              </div>
              <LoadingSkeleton width="76px" />
              <LoadingSkeleton width="92px" />
              <LoadingSkeleton width="62px" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function PassesSkeleton() {
  return (
    <div className="passes-skeleton" role="status" aria-label="Loading passes">
      {Array.from({ length: 3 }, (_, index) => (
        <div className="pass bz" key={index}>
          <div className="pl">
            <div className="passes-skeleton-header">
              <LoadingSkeleton className="passes-skeleton-logo" />
              <LoadingSkeleton width="78px" />
            </div>
            <LoadingSkeleton className="passes-skeleton-name" width="72%" />
            <LoadingSkeleton className="passes-skeleton-line" width="82%" />
            <div className="passes-skeleton-band">
              <LoadingSkeleton width="54%" />
              <LoadingSkeleton width="34%" />
            </div>
            <div className="passes-skeleton-zones">
              {Array.from({ length: 4 }, (_, zone) => <LoadingSkeleton key={zone} width={zone % 2 ? '24%' : '18%'} />)}
            </div>
            <LoadingSkeleton className="passes-skeleton-qr" />
            <div className="passes-skeleton-vehicle">
              <LoadingSkeleton width="56px" />
              <LoadingSkeleton width="110px" />
            </div>
            <LoadingSkeleton className="passes-skeleton-fine" width="92%" />
          </div>
        </div>
      ))}
    </div>
  )
}

type UtilitySkeletonKind = 'orgs' | 'users' | 'devices' | 'aaa'

export function UtilityScreenSkeleton({ kind }: { kind: UtilitySkeletonKind }) {
  const isAaa = kind === 'aaa'
  const isOrgs = kind === 'orgs'
  const isUsers = kind === 'users'

  return (
    <div className={`utility-skeleton utility-skeleton-${kind}`} aria-label="Loading content">
      <div className="utility-skeleton-form bz">
        <div className="pl pad">
          <LoadingSkeleton className="utility-skeleton-form-title" width={isAaa ? '132px' : '170px'} />
          {isUsers && <LoadingSkeleton className="utility-skeleton-copy" width="78%" />}
          <div className={`utility-skeleton-fields ${isAaa ? 'utility-skeleton-fields-single' : ''}`}>
            {Array.from({ length: isAaa ? 3 : isUsers ? 3 : isOrgs ? 6 : 3 }, (_, index) => (
              <div className="utility-skeleton-field" key={index}>
                <LoadingSkeleton width={index === 0 ? '58px' : '82px'} />
                <LoadingSkeleton className="utility-skeleton-input" />
              </div>
            ))}
          </div>
          <LoadingSkeleton className="utility-skeleton-button" width={isAaa ? '168px' : '142px'} />
        </div>
      </div>
      <div className="utility-skeleton-list">
        <LoadingSkeleton className="utility-skeleton-list-title" width={isAaa ? '178px' : '104px'} />
        {Array.from({ length: 4 }, (_, index) => (
          <div className="utility-skeleton-item bz" key={index}>
            <div className="pl pad">
              <div className="utility-skeleton-item-row">
                <div>
                  <LoadingSkeleton width={index === 0 ? '180px' : '148px'} />
                  <LoadingSkeleton className="utility-skeleton-subline" width={isAaa ? '132px' : '206px'} />
                  {isAaa && <LoadingSkeleton className="utility-skeleton-status" width="176px" />}
                </div>
                <LoadingSkeleton className="utility-skeleton-item-action" width={isAaa ? '150px' : '90px'} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
