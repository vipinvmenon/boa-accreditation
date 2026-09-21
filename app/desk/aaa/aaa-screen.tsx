'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { type AaaNomination } from '@/lib/schemas/aaa'
import { UtilityScreenSkeleton } from '@/components/loading-skeleton'

const labelStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono',monospace",
  fontSize: '9.5px',
  fontWeight: 700,
  letterSpacing: '0.13em',
  textTransform: 'uppercase',
  color: 'var(--ink3,rgba(242,239,226,0.52))',
}

const ERROR_COPY: Record<string, string> = {
  duplicate_nomination: 'That phone is already on the AAA named list.',
  not_authorized: 'Only an active operator may manage the AAA list.',
  already_decided: 'That nomination has already been approved.',
  invalid_body: 'Check the name and Indian mobile number.',
  internal: "That didn't go through. Try again.",
}

function errorCopy(body: unknown): string {
  if (body && typeof body === 'object' && 'error' in body) {
    return ERROR_COPY[String((body as Record<string, unknown>)['error'])] ?? ERROR_COPY['internal']!
  }
  return ERROR_COPY['internal']!
}

export function AaaScreen() {
  const router = useRouter()
  const [nominations, setNominations] = useState<AaaNomination[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [form, setForm] = useState({ fullName: '', phone: '+91', orgHint: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('Loading AAA nominees.')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const response = await fetch('/api/desk/aaa')
      if (cancelled) return
      if (response.status === 401) {
        router.replace('/desk/login')
        return
      }
      const body: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const message = errorCopy(body)
        setLoadError(message)
        setAnnouncement(`Could not load AAA nominees. ${message}`)
        return
      }
      if (
        !body ||
        typeof body !== 'object' ||
        !('nominations' in body) ||
        !Array.isArray(body.nominations)
      ) {
        setLoadError(ERROR_COPY['internal']!)
        setAnnouncement(`Could not load AAA nominees. ${ERROR_COPY['internal']!}`)
        return
      }
      setNominations(body.nominations as AaaNomination[])
      setAnnouncement('AAA nominees loaded.')
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [router])

  async function addNomination(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)
    setSaving(true)
    const response = await fetch('/api/desk/aaa', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    const body: unknown = await response.json().catch(() => null)
    if (response.status === 401) {
      router.replace('/desk/login')
      return
    }
    if (!response.ok) {
      const message = errorCopy(body)
      setFormError(message)
      setAnnouncement(`Could not add nominee. ${message}`)
      return
    }
    if (body && typeof body === 'object' && 'nomination' in body) {
      setNominations((current) => [...(current ?? []), body.nomination as AaaNomination])
      setForm({ fullName: '', phone: '+91', orgHint: '' })
      setAnnouncement('AAA nominee added.')
    }
  }

  async function approve(id: string) {
    setApprovingId(id)
    const response = await fetch(`/api/desk/aaa/${id}`, { method: 'POST' })
    const body: unknown = await response.json().catch(() => null)
    setApprovingId(null)
    if (response.status === 401) {
      router.replace('/desk/login')
      return
    }
    if (!response.ok) {
      const message = errorCopy(body)
      setLoadError(message)
      setAnnouncement(`Could not approve nomination. ${message}`)
      return
    }
    if (body && typeof body === 'object' && 'nomination' in body) {
      const updated = body.nomination as AaaNomination
      setNominations((current) => (current ?? []).map((item) => (item.id === id ? updated : item)))
      setAnnouncement('AAA nomination approved.')
    }
  }

  return (
    <main className="utility-screen">
      <div className="utility-inner">
        {!formError && !loadError && (
          <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
        )}
        <header className="utility-head">
          <div>
            <div className="tag gold">AAA override</div>
            <h1 className="h1">
          Named access only
            </h1>
          </div>
        </header>
        <p className="lede">
          AAA is never requestable on a vendor link. Add the person to Salman&apos;s named list, approve the nomination, then approve that person as AAA in the queue.
        </p>

        <section className="utility-section bz"><div className="pl pad">
          <h2 style={{ ...labelStyle, color: 'var(--gold,#E3BB72)', margin: '0 0 16px' }}>Add nominee</h2>
          <form onSubmit={addNomination} className="utility-form">
            <label className="utility-label"><span>Full name</span><input required value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} className="utility-input" /></label>
            <label className="utility-label"><span>Phone</span><input required value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} className="utility-input" /></label>
            <label className="utility-label"><span>Organisation (optional)</span><input value={form.orgHint} onChange={(event) => setForm((current) => ({ ...current, orgHint: event.target.value }))} className="utility-input" maxLength={120} /></label>
            <div className="utility-actions">
              <button type="submit" disabled={saving} className="btn gold hov-invert-gold" style={{ opacity: saving ? 0.6 : 1 }}>{saving ? 'Adding…' : 'Add to named list'}</button>
              {formError && <span role="alert" className="utility-error">{formError}</span>}
            </div>
          </form>
        </div></section>

        {loadError && <p role="alert" className="utility-error">{loadError}</p>}
        {nominations === null && !loadError && <div role="status"><UtilityScreenSkeleton kind="aaa" /></div>}
        {nominations?.length === 0 && <p style={{ color: 'var(--ink3,rgba(242,239,226,0.52))' }}>No AAA nominees yet.</p>}
        <div className="utility-list">
          {nominations?.map((nomination) => (
            <div key={nomination.id} className="bz"><div className="pl pad utility-row">
              <div>
                <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: '18px', color: 'var(--ink,#F2EFE2)' }}>{nomination.full_name}</div>
                <div style={{ ...labelStyle, marginTop: '5px' }}>{nomination.phone}{nomination.org_hint ? ` · ${nomination.org_hint}` : ''}</div>
                <div style={{ ...labelStyle, color: nomination.approved ? 'var(--grn,#00F5A5)' : 'var(--gold,#E3BB72)', marginTop: '8px' }}>{nomination.person_id ? 'Stamped on pass' : nomination.approved ? 'Approved — ready for AAA decision' : 'Pending nomination approval'}</div>
              </div>
              {!nomination.approved && <button type="button" disabled={approvingId === nomination.id} onClick={() => approve(nomination.id)} className="btn gold hov-invert-gold" style={{ opacity: approvingId === nomination.id ? 0.6 : 1 }}>{approvingId === nomination.id ? 'Approving…' : 'Approve nomination'}</button>}
            </div></div>
          ))}
        </div>
      </div>
    </main>
  )
}
