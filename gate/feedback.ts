/**
 * A buzz and a short tone when the gate reads a pass (Vipin, 1 Oct), so the
 * issuer knows the verdict without looking down at the phone in their hand.
 *
 * Green: one short buzz, one high blip. Amber: two buzzes, two mid blips.
 * Red: a long double buzz and a low tone. The tones are synthesised with
 * WebAudio, so there is no sound file to fetch and nothing changes offline
 * (non-negotiable #7). iOS Safari has no navigator.vibrate, so iPhones get
 * the tone alone.
 *
 * Browsers only let a page make sound after a tap: `unlockFeedback` is called
 * from the first pointerdown on the gate ("Start camera", a search row), and
 * a read before that is silent, never an error.
 */

export type Verdict = 'green' | 'amber' | 'red'

const PATTERN: Record<Verdict, { vibrate: number[]; tones: Array<{ hz: number; at: number; ms: number }> }> = {
  green: { vibrate: [60], tones: [{ hz: 1320, at: 0, ms: 90 }] },
  amber: { vibrate: [50, 70, 50], tones: [{ hz: 880, at: 0, ms: 80 }, { hz: 880, at: 0.14, ms: 80 }] },
  red: { vibrate: [180, 90, 180], tones: [{ hz: 220, at: 0, ms: 160 }, { hz: 180, at: 0.2, ms: 220 }] },
}

let audio: AudioContext | null = null

function context(): AudioContext | null {
  if (audio) return audio
  const Ctor = typeof window === 'undefined' ? undefined : window.AudioContext
  if (!Ctor) return null
  try {
    audio = new Ctor()
  } catch {
    return null
  }
  return audio
}

export function unlockFeedback(): void {
  const ctx = context()
  if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {})
}

export function signalVerdict(verdict: Verdict): void {
  const { vibrate, tones } = PATTERN[verdict]
  try {
    navigator.vibrate?.(vibrate)
  } catch {
    // Some browsers throw when vibration is blocked; the tone still plays.
  }
  const ctx = audio
  if (!ctx || ctx.state !== 'running') return
  const start = ctx.currentTime
  for (const tone of tones) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = verdict === 'red' ? 'square' : 'sine'
    osc.frequency.value = tone.hz
    const t0 = start + tone.at
    const t1 = t0 + tone.ms / 1000
    // A 5ms attack and an exponential release: a blip, not a click.
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(verdict === 'red' ? 0.08 : 0.16, t0 + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.0001, t1)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t0)
    osc.stop(t1 + 0.02)
  }
}
