import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Dialog } from '../../components/Dialog'
import { Button, SelectField, TextAreaField, TextField } from '../../components/ui'
import { formatDate, PRIORITY_LABEL, STATUS_LABEL } from '../../lib/format'
import {
  PRIORITIES,
  TASK_STATUSES,
  type Member,
  type Project,
  type Task,
  type TaskInput,
} from '../../lib/types'
import { useUi } from '../../stores/ui'
import { useOrg } from '../org/orgContext'
import { taskSchema, toTaskInput, type TaskValues } from './taskSchema'
import { nextTempId, useBoardMutations } from './useBoardMutations'

/** Create or edit a task. Saving closes the dialog at once: the board updates optimistically. */
export function TaskDialog({
  tasks,
  project,
  members,
}: {
  tasks: Task[]
  project: Project
  members: Member[]
}) {
  const dialog = useUi((s) => s.taskDialog)
  const close = useUi((s) => s.closeTaskDialog)
  const task = dialog?.mode === 'edit' ? tasks.find((t) => t.id === dialog.taskId) : undefined
  const title = dialog?.mode === 'edit' ? (task ? `${task.key}` : 'Task not found') : 'New task'

  return (
    <Dialog open={dialog !== null} onClose={close} title={title} wide>
      {dialog?.mode === 'create' && (
        <TaskForm
          key={`new-${dialog.status}`}
          project={project}
          members={members}
          initialStatus={dialog.status}
        />
      )}
      {dialog?.mode === 'edit' &&
        (task ? (
          <TaskForm key={task.id} project={project} members={members} task={task} />
        ) : (
          <p className="text-sm text-zinc-500">
            This task was deleted or moved to another project.
          </p>
        ))}
    </Dialog>
  )
}

function TaskForm({
  project,
  members,
  task,
  initialStatus = 'todo',
}: {
  project: Project
  members: Member[]
  task?: Task
  initialStatus?: Task['status']
}) {
  const { orgId } = useOrg()
  const close = useUi((s) => s.closeTaskDialog)
  const { create, update, remove } = useBoardMutations(orgId, project.id, project.key)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, dirtyFields },
  } = useForm<TaskValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: task?.title ?? '',
      description: task?.description ?? '',
      status: task?.status ?? initialStatus,
      priority: task?.priority ?? 'medium',
      assignee: task?.assignee_id ? String(task.assignee_id) : '',
      due_date: task?.due_date ?? '',
    },
  })

  const onSubmit = handleSubmit((values) => {
    const input = toTaskInput(values)
    if (!task) {
      create.mutate({ input, tempId: nextTempId() })
    } else {
      // Send only what changed, so two people editing different fields don't overwrite each other.
      const fieldOf = { assignee: 'assignee_id', due_date: 'due_date' } as const
      const patch: Partial<TaskInput> = {}
      for (const name of Object.keys(dirtyFields) as (keyof TaskValues)[]) {
        const apiField =
          name in fieldOf ? fieldOf[name as keyof typeof fieldOf] : (name as keyof TaskInput)
        Object.assign(patch, { [apiField]: input[apiField] })
      }
      if (Object.keys(patch).length > 0) update.mutate({ taskId: task.id, patch })
    }
    close()
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <TextField label="Title" autoFocus error={errors.title?.message} {...register('title')} />
      <TextAreaField
        label="Description"
        rows={4}
        error={errors.description?.message}
        {...register('description')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Status" {...register('status')}>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </SelectField>
        <SelectField label="Priority" {...register('priority')}>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </SelectField>
        <SelectField label="Assignee" {...register('assignee')}>
          <option value="">Nobody</option>
          {members.map((m) => (
            <option key={m.user.id} value={m.user.id}>
              {m.user.full_name}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Due date"
          type="date"
          error={errors.due_date?.message}
          {...register('due_date')}
        />
      </div>

      {task && (
        <p className="text-xs text-zinc-500">
          Created {formatDate(task.created_at)}
          {task.completed_at && ` · Completed ${formatDate(task.completed_at)}`}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button type="submit">{task ? 'Save changes' : 'Create task'}</Button>
        <Button variant="secondary" onClick={close}>
          Cancel
        </Button>
        {task && (
          <div className="ml-auto">
            {confirmDelete ? (
              <Button
                variant="danger"
                onClick={() => {
                  remove.mutate(task.id)
                  close()
                }}
              >
                Yes, delete {task.key}
              </Button>
            ) : (
              <Button
                variant="ghost"
                className="text-red-600 dark:text-red-400"
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            )}
          </div>
        )}
      </div>
    </form>
  )
}
