import { z } from 'zod'

export const projectSchema = z.object({
  name: z.string().trim().min(2, 'At least 2 characters').max(100, 'Keep it under 100 characters'),
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9]{1,9}$/, '2–10 letters or digits, starting with a letter'),
  description: z.string().trim().max(2000, 'Keep it under 2000 characters'),
})
export type ProjectValues = z.infer<typeof projectSchema>

/** "Website relaunch" -> "WR", "Platform" -> "PLA": a sensible default the user can change. */
export function suggestKey(name: string): string {
  const words = name.toUpperCase().match(/[A-Z][A-Z0-9]*/g) ?? []
  if (words.length >= 2)
    return words
      .slice(0, 4)
      .map((w) => w[0])
      .join('')
  return (words[0] ?? '').slice(0, 3)
}
