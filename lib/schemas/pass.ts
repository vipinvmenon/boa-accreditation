import { z } from 'zod'

export const passSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  role: z.string(),
  vehicleReg: z.string().nullable(),
  orgName: z.string(),
  passRef: z.string(),
  passToken: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  typeCode: z.enum(['crew', 'stage', 'aaa']),
  dayValidity: z.enum(['build', 'show', 'build_show']),
})

export const passesSchema = z.array(passSchema)
export type Pass = z.infer<typeof passSchema>
