/**
 * One 404 for every miss, and it says nothing about why.
 *
 * This page is what an unknown, revoked, expired, rejected or simply
 * mistyped token gets. That is deliberate: a 403 on a real token and a 404
 * on a fake one would let anyone probe which 22-character strings exist.
 * See docs/SECURITY.md.
 */
export default function NotFound() {
  return (
    <main className="utility-auth">
      <div className="utility-inner">
        <div className="tag">Link status</div>
        <h1 className="h1">
          This link is not valid
        </h1>
        <p className="lede">
          It may have been mistyped, replaced by a newer link, or closed. Ask the person
          who sent it to you for a current one.
        </p>
      </div>
    </main>
  )
}
