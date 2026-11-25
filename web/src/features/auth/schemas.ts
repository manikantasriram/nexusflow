// Form rules, written once with Zod. The same schema validates the form (through React Hook
// Form's resolver) and gives us the TypeScript type of its values.

import { z } from 'zod'

export const loginSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})
export type LoginValues = z.infer<typeof loginSchema>

export const registerSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your name').max(100, 'Keep it under 100 characters'),
  email: z.email('Enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters').max(128, 'Keep it under 128 characters'),
  organization_name: z
    .string()
    .trim()
    .min(2, 'Name your organization (at least 2 characters)')
    .max(100, 'Keep it under 100 characters'),
})
export type RegisterValues = z.infer<typeof registerSchema>
