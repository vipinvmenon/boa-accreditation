/**
 * Fonts are loaded through @fontsource, NOT next/font, and that is a deliberate
 * decision worth defending because it looks like the wrong one.
 *
 * next/font generates an obfuscated family name (`__Anton_abc123`) and exposes
 * it as a CSS variable. The approved design writes its font stacks as literals —
 * `font-family:'Anton',sans-serif`, `font-family:'JetBrains Mono',monospace` —
 * inside 560 lines of inline style attributes that docs/DESIGN-SYSTEM.md requires
 * us to transcribe verbatim. Under next/font every one of those literals would
 * resolve to nothing and silently fall back to a system face: the layout would
 * look approximately right in review and be wrong in every glyph.
 *
 * @fontsource declares the real family names ('Anton', 'Oswald', 'Archivo',
 * 'JetBrains Mono') and self-hosts the woff2, so the design's own strings work
 * untouched and the CSP can stay `font-src 'self'` with no Google origin.
 * boa-bar-control reached the same conclusion for the same reason.
 *
 * EVERY WEIGHT THE DESIGN USES MUST BE IMPORTED HERE. An unimported weight does
 * not fail loudly — the browser synthesises it, and the screen renders at a
 * subtly wrong weight that nobody catches until print.
 *
 * Weights actually used by the design, audited per style attribute rather than
 * guessed (scripts/audit-font-weights.mjs re-runs the audit):
 *   Anton           400        - the only weight Anton ships
 *   Oswald          400 500 600 700
 *   Archivo         400        + 700 for <strong>, which inherits UA bold
 *   JetBrains Mono  400 500 600 700
 *
 * font-synthesis is deliberately NOT disabled here, unlike bar-control. The
 * design gives every <h1>/<h2> font-family:'Anton' with no font-weight, so the
 * UA stylesheet applies bold=700 and Anton has no 700 — the approved artboard
 * is therefore rendering synthesised bold. Turning synthesis off would be a
 * visual deviation from the artefact we are contracted to reproduce. This is
 * settled against the rendered reference by the visual gate, not by opinion.
 * See docs/DESIGN-SYSTEM.md, "The Anton bold question".
 */
import '@fontsource/anton/400.css'
import '@fontsource/oswald/400.css'
import '@fontsource/oswald/500.css'
import '@fontsource/oswald/600.css'
import '@fontsource/oswald/700.css'
import '@fontsource/archivo/400.css'
import '@fontsource/archivo/600.css'
import '@fontsource/archivo/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/600.css'
import '@fontsource/jetbrains-mono/700.css'
// r10 body face (ADR-027, ACC-178). Variable: one file covers every weight,
// and the family name is 'Instrument Sans Variable'.
import '@fontsource-variable/instrument-sans'

import type { Metadata, Viewport } from 'next'
import './globals.css'
import './responsive.css'
import './hover.css'
import './v2.css'
import './ticket.css'
import './phosphor.css'
import './r10/tokens.css'
import './r10/base.css'
import './r10/primitives.css'
import './r10/glass.css'
import { StyledJsxRegistry } from './styled-jsx-registry'

export const metadata: Metadata = {
  // ACC-127: every route below sets its own `title` (a plain string), which
  // fills the `%s` here. A route that sets no title falls back to `default`.
  // `/p/[passToken]` deliberately sets neither its own title.template nor a
  // person's name into `title` — see that route's page.tsx — so a shared
  // device's tab strip never reads out who is accredited.
  title: {
    template: '%s · BOA Accreditation',
    default: 'BOA Accreditation',
  },
  description: 'Crew accreditation and wristband check-in for Bangalore Open Air 2026.',
  // Nothing here should ever be indexed: every surface is behind a secret token
  // or a login, and a crawled /p/<pass_token> would publish a credential.
  // vercel.json sets X-Robots-Tag on /s/* and /p/* too — belt and braces,
  // because this is unrecoverable once it has happened.
  robots: { index: false, follow: false, nocache: true },
  applicationName: 'BOA Accreditation',
  // Deliberately no manifest: a responsive web app, not a PWA. The only service
  // worker is scoped to /gate/ and registered from app/gate/layout.tsx.
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0A0A0A',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body
        style={{
          margin: 0,
          background: 'var(--bg, #0A0A0A)',
          fontFamily: "'Archivo', system-ui, sans-serif",
          color: 'var(--ink2, rgba(242,239,226,0.72))',
        }}
      >
        <StyledJsxRegistry>{children}</StyledJsxRegistry>
      </body>
    </html>
  )
}
