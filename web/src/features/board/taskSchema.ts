import { z } from 'zod'
import { PRIORITIES, TASK_STATUSES, type TaskInput } from '../../lib/types'

export const taskSchema = z.object({
  title: z.string().trim().min(1, 'Give the task a title').max(200, 'Keep it under 200 characters'),
  description: z.string().max(10_000, 'Keep it under 10,000 characters'),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(PRIORITIES),
  /** A member's id as text, or '' for nobody (that's what a <select> gives us). */
  assignee: z.string(),
  /** YYYY-MM-DD from <input type="date">, or '' for no date. */
  due_date: z.union([z.literal(''), z.iso.date('Pick a valid date')]),
})
export type TaskValues = z.infer<typeof taskSchema>

export function toTaskInput(values: TaskValues): TaskInput {
  return {
    title: values.title,
    description: values.description,
    status: values.status,
    priority: values.priority,
    assignee_id: values.assignee === '' ? null : Number(values.assignee),
    due_date: values.due_date === '' ? null : values.due_date,
  }
}
