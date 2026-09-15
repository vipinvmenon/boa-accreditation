'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { type AaaNomination } from '@/lib/schemas/aaa'

const inputStyle: React.CSSProperties = {
  border: '1px solid var(--rule,rgba(242,239,226,0.16))',
  background: 'var(--panel,#101012)',
  color: 'var(--ink,#F2EFE2)',
  fontFamily: "'Oswald',sans-serif",
  fontSize: '15px',
  padding: '11px 13px',
  width: '100%',
  minHeight: '44px',
}
const buttonStyle: React.CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--gold,#E3BB72)',
  background: 'var(--gold,#E3BB72)',
  color: 'var(--on,#0A0A0A)',
  padding: '12px 20px',
  fontFamily: "'Oswald',sans-serif",
  fontSize: '13px',
  fontWeight: 600,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  minHeight: '44px',
}
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
        setLoadError(errorCopy(body))
        return
      }
      if (
        !body ||
        typeof body !== 'object' ||
        !('nominations' in body) ||
        !Array.isArray(body.nominations)
      ) {
        setLoadError(ERROR_COPY['internal']!)
        return
      }
      setNominations(body.nominations as AaaNomination[])
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
      setFormError(errorCopy(body))
      return
    }
    if (body && typeof body === 'object' && 'nomination' in body) {
      setNominations((current) => [...(current ?? []), body.nomination as AaaNomination])
      setForm({ fullName: '', phone: '+91', orgHint: '' })
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
      setLoadError(errorCopy(body))
      return
    }
    if (body && typeof body === 'object' && 'nomination' in body) {
      const updated = body.nomination as AaaNomination
      setNominations((current) => (current ?? []).map((item) => (item.id === id ? updated : item)))
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg,#0A0A0A)', padding: '28px 18px 64px' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        <div style={{ color: 'var(--gold,#E3BB72)', ...labelStyle, marginBottom: '12px' }}>AAA override</div>
        <h1 style={{ fontFamily: "'Anton',sans-serif", fontSize: 'clamp(32px, 7vw, 54px)', lineHeight: 0.94, textTransform: 'uppercase', color: 'var(--ink,#F2EFE2)', margin: '0 0 14px' }}>
          Named access only
        </h1>
        <p style={{ color: 'var(--ink2,rgba(242,239,226,0.72))', fontSize: '15px', lineHeight: 1.55, margin: '0 0 28px', maxWidth: '58ch' }}>
          AAA is never requestable on a vendor link. Add the person to Salman&apos;s named list, approve the nomination, then approve that person as AAA in the queue.
        </p>

        <section style={{ border: '1px solid var(--gold,#E3BB72)', background: 'var(--panel,#101012)', padding: '20px', marginBottom: '28px' }}>
          <h2 style={{ ...labelStyle, color: 'var(--gold,#E3BB72)', margin: '0 0 16px' }}>Add nominee</h2>
          <form onSubmit={addNomination} style={{ display: 'grid', gap: '14px' }}>
            <label style={{ display: 'grid', gap: '6px' }}><span style={labelStyle}>Full name</span><input required value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} style={inputStyle} /></label>
            <label style={{ display: 'grid', gap: '6px' }}><span style={labelStyle}>Phone</span><input required value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} style={inputStyle} /></label>
            <label style={{ display: 'grid', gap: '6px' }}><span style={labelStyle}>Organisation (optional)</span><input value={form.orgHint} onChange={(event) => setForm((current) => ({ ...current, orgHint: event.target.value }))} style={inputStyle} maxLength={120} /></label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <button type="submit" disabled={saving} className="hov-invert-gold" style={{ ...buttonStyle, opacity: saving ? 0.6 : 1 }}>{saving ? 'Adding…' : 'Add to named list'}</button>
              {formError && <span style={{ color: 'var(--bad,#FF6B5A)', fontSize: '13px' }}>{formError}</span>}
            </div>
          </form>
        </section>

        {loadError && <p style={{ color: 'var(--bad,#FF6B5A)', fontSize: '13px' }}>{loadError}</p>}
        {nominations === null && !loadError && <p style={{ color: 'var(--ink3,rgba(242,239,226,0.52))' }}>Loading…</p>}
        {nominations?.length === 0 && <p style={{ color: 'var(--ink3,rgba(242,239,226,0.52))' }}>No AAA nominees yet.</p>}
        <div style={{ display: 'grid', gap: '10px' }}>
          {nominations?.map((nomination) => (
            <div key={nomination.id} style={{ border: '1px solid var(--rule,rgba(242,239,226,0.16))', background: 'var(--panel,#101012)', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: '18px', color: 'var(--ink,#F2EFE2)' }}>{nomination.full_name}</div>
                <div style={{ ...labelStyle, marginTop: '5px' }}>{nomination.phone}{nomination.org_hint ? ` · ${nomination.org_hint}` : ''}</div>
                <div style={{ ...labelStyle, color: nomination.approved ? 'var(--grn,#00F5A5)' : 'var(--gold,#E3BB72)', marginTop: '8px' }}>{nomination.person_id ? 'Stamped on pass' : nomination.approved ? 'Approved — ready for AAA decision' : 'Pending nomination approval'}</div>
              </div>
              {!nomination.approved && <button type="button" disabled={approvingId === nomination.id} onClick={() => approve(nomination.id)} className="hov-invert-gold" style={{ ...buttonStyle, opacity: approvingId === nomination.id ? 0.6 : 1 }}>{approvingId === nomination.id ? 'Approving…' : 'Approve nomination'}</button>}
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
