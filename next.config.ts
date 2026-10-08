import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import type { NextConfig } from 'next'

// The footer's version: the major from package.json, then the commit count, so
// it goes up with every push and shows which build is live. A shallow clone
// would give a wrong count, so it falls back to the short commit instead.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
function appVersion(): string {
  const major = pkg.version.split('.')[0] ?? '1'
  const git = (cmd: string) => execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  try {
    if (git('git rev-parse --is-shallow-repository') === 'true') {
      return `${major}.${(process.env['VERCEL_GIT_COMMIT_SHA'] ?? git('git rev-parse HEAD')).slice(0, 7)}`
    }
    return `${major}.${git('git rev-list --count HEAD')}`
  } catch {
    return `${major}.0`
  }
}

const config: NextConfig = {
  reactStrictMode: true,

  env: { NEXT_PUBLIC_APP_VERSION: appVersion() },

  // The design is 560 lines of inline `style` attributes and the transcription
  // reproduces them verbatim (docs/DESIGN-SYSTEM.md). Nothing here may rewrite them.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: '/gate/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache' },
          { key: 'Service-Worker-Allowed', value: '/gate' },
        ],
      },
    ]
  },

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
