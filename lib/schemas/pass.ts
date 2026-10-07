import { z } from 'zod'
import { tierCodeSchema } from './accreditation'

export const passSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  role: z.string(),
  vehicleReg: z.string().nullable(),
  orgName: z.string(),
  passRef: z.string(),
  passToken: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  typeCode: tierCodeSchema,
  dayValidity: z.enum(['build', 'show', 'build_show']),
})

export const passesSchema = z.array(passSchema)
export const passesResponseSchema = z.object({
  passes: passSchema.array(),
})
export type Pass = z.infer<typeof passSchema>
