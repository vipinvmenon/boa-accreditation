import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,

  // The design is 560 lines of inline `style` attributes and the transcription
  // reproduces them verbatim (docs/DESIGN-SYSTEM.md). Nothing here may rewrite them.
  poweredByHeader: false,

  // Next 16 no longer accepts an `eslint` key here. Lint is its own gate
  // (`corepack pnpm lint`) and is a required CI job, which is the better place
  // for it: it runs on every push, not only on the builds someone remembers.
  typescript: {
    // A type error must fail the build. Stated explicitly so nobody
    // "temporarily" flips it during the 4-10 Oct freeze.
    ignoreBuildErrors: false,
  },

  images: {
    // Only ever our own extracted assets. No remote patterns, deliberately.
    formats: ['image/webp'],
  },
}

export default config
