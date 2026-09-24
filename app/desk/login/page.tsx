import type { Metadata } from 'next'
import { connection } from 'next/server'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Sign in' }

/**
 * Must render per request, never prerender. middleware.ts sends a fresh
 * `nonce-… 'strict-dynamic'` CSP on every response, and Next can only stamp
 * that nonce onto <script> tags while rendering the request. A prerendered
 * copy (which this page was until ACC-100, being a pure 'use client' page)
 * ships nonce-less scripts from the CDN, the browser blocks every one, and
 * the form never appears — production login was blank for days that way.
 * scripts/verify-deploy.mjs now fails the deploy if it happens again.
 * See node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
 */
export default async function DeskLoginPage() {
  await connection()
  return <LoginForm />
}
