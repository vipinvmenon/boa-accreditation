import { z } from 'zod'

// ACC-144 · The boundary between /api/desk/passes/send and the pass sheet.
// Shared by the route (server) and passes-screen (client), so it must stay free
// of anything server-only — lib/whatsapp.ts is NOT imported here.

export const sendStatusSchema = z.enum(['queued', 'sent', 'delivered', 'read', 'failed'])
export type SendStatus = z.infer<typeof sendStatusSchema>

export const personSendSchema = z.object({
  personId: z.string().uuid(),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  attempts: z.number().int().nonnegative(),
  live: z.boolean(),
  last: z
    .object({
      sendId: z.string().uuid(),
      status: sendStatusSchema,
      requestedAt: z.string(),
      statusAt: z.string(),
      failureReason: z.string().nullable(),
      hasMessageId: z.boolean(),
      /** A lead sent it from their own phone and marked it here. */
      manual: z.boolean().default(false),
      sentBy: z.string().nullable(),
    })
    .nullable(),
})
export type PersonSend = z.infer<typeof personSendSchema>

/** What boa_acc_pass_sends() returns. */
export const passSendsRpcSchema = z.object({
  canSend: z.boolean(),
  people: z.array(personSendSchema),
})

/** GET /api/desk/passes/send */
export const passSendsResponseSchema = passSendsRpcSchema.extend({
  configured: z.boolean(),
})
export type PassSendsResponse = z.infer<typeof passSendsResponseSchema>

/** POST /api/desk/passes/send */
export const sendRequestSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('one'), personId: z.string().uuid(), resend: z.boolean().default(false) }),
  z.object({ mode: z.literal('all') }),
  // Sent by hand from the desk's phone (the wa.me link): records it, sends nothing.
  z.object({ mode: z.literal('manual'), personId: z.string().uuid() }),
  // One organisation's rollout: the client names the people, the database still
  // decides each one (approved, not already sent, caller is a lead or admin).
  z.object({ mode: z.literal('ids'), personIds: z.array(z.string().uuid()).min(1).max(300) }),
])
export type SendRequest = z.input<typeof sendRequestSchema>

export const sendOutcomeSchema = z.enum([
  'marked', // recorded as sent by hand
  'queued', // Meta accepted it; the webhook moves it on from here
  'failed', // Meta refused it, or never answered — reason says which
  'already_sent',
  'not_approved',
  'not_found',
  'error',
])

export const sendResultSchema = z.object({
  personId: z.string().uuid(),
  outcome: sendOutcomeSchema,
  reason: z.string().nullable(),
})
export type SendResult = z.infer<typeof sendResultSchema>

export const sendResponseSchema = z.object({
  results: z.array(sendResultSchema),
  /** "Send all" works in time-boxed batches; > 0 means press again. */
  remaining: z.number().int().nonnegative(),
})
export type SendResponse = z.infer<typeof sendResponseSchema>

/** What boa_acc_pass_send_begin() returns. */
export const sendBeginSchema = z.object({
  sendId: z.string().uuid(),
  personId: z.string().uuid(),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  firstName: z.string(),
  passToken: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
})
