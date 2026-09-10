import next from 'eslint-config-next'
import tseslint from 'typescript-eslint'

const config = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'design/**',
      'public/**',
      'supabase/**',
      'next-env.d.ts',
    ],
  },
  // eslint-config-next ships a flat-config ARRAY in Next 16 (it was a factory
  // in earlier majors). Spread it, do not call it.
  ...next,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // The service-role client bypasses RLS entirely. It must never be
              // reachable from anything that can end up in a client bundle.
              group: ['**/lib/supabase-admin', '@/lib/supabase-admin'],
              message:
                'supabase-admin holds the service-role key and bypasses RLS. Import it only from app/api/** route handlers or server-only modules.',
            },
          ],
        },
      ],
    },
  },
  {
    // app/api/** is exactly where the service-role client is supposed to live.
    files: ['app/api/**/*.ts', 'lib/supabase-admin.ts', 'scripts/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // The gate is the one surface that must work with the radio off. Nothing
    // there may reach for the network directly: every read comes from the Dexie
    // cache and every write goes through the outbox. gate/roster.ts and
    // gate/outbox.ts are the two sanctioned exceptions.
    files: ['gate/**/*.ts', 'app/gate/**/*.tsx'],
    ignores: ['gate/roster.ts', 'gate/outbox.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message:
            'The gate reads from Dexie and writes to the outbox. Only gate/roster.ts and gate/outbox.ts may talk to the network.',
        },
      ],
    },
  },
]

export default config
