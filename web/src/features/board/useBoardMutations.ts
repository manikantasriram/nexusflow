// Optimistic board updates with rollback.
//
// 1. onMutate: stop in-flight refetches, remember the current list, apply the change locally
//    with boardReducer, so the UI updates instantly.
// 2. onError: put the remembered list back and tell the user.
// 3. onSettled: refetch, so the cache ends up exactly as the server sees it. When several board
//    changes are in flight, only the last one to finish refetches; an earlier refetch would
//    briefly undo the later optimistic changes.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { keys } from '../../lib/queries'
import type { Task, TaskInput, TaskPatch, TaskStatus } from '../../lib/types'
import { errorMessage, toast } from '../../stores/toast'
import { boardReducer, endOfColumn, type BoardAction } from './boardReducer'

interface Snapshot {
  previous?: Task[]
}

let tempSeq = 0
/** Ids below zero mark tasks the server hasn't confirmed yet. */
export const nextTempId = () => --tempSeq

export function useBoardMutations(orgId: number, projectId: number, projectKey: string) {
  const qc = useQueryClient()
  const key = keys.tasks(orgId, projectId)
  const mutationKey = ['board', orgId, projectId]

  const apply = async (action: BoardAction): Promise<Snapshot> => {
    await qc.cancelQueries({ queryKey: key })
    const previous = qc.getQueryData<Task[]>(key)
    qc.setQueryData<Task[]>(key, (old) => (old ? [...boardReducer(old, action)] : old))
    return { previous }
  }

  const rollback = (snapshot: Snapshot | undefined, what: string, error: unknown) => {
    if (snapshot?.previous) qc.setQueryData(key, snapshot.previous)
    toast.error(`${what}: ${errorMessage(error)}`)
  }

  const settle = () => {
    if (qc.isMutating({ mutationKey }) > 1) return
    void qc.invalidateQueries({ queryKey: key })
    void qc.invalidateQueries({ queryKey: keys.stats(orgId) })
    void qc.invalidateQueries({ queryKey: keys.projects(orgId), exact: true })
    void qc.invalidateQueries({
      queryKey: keys.project(orgId, projectId),
      exact: true,
    })
    void qc.invalidateQueries({ queryKey: keys.myTasks(orgId) })
  }

  const move = useMutation({
    mutationKey,
    mutationFn: (v: { taskId: number; status: TaskStatus; index: number }) =>
      api.moveTask(orgId, v.taskId, v.status, v.index),
    onMutate: (v) => apply({ type: 'task/moved', ...v }),
    onError: (error, _v, snapshot) => rollback(snapshot, "Couldn't move the card", error),
    onSettled: settle,
  })

  const create = useMutation({
    mutationKey,
    mutationFn: (v: { input: TaskInput; tempId: number }) =>
      api.createTask(orgId, projectId, v.input),
    onMutate: ({ input, tempId }) => {
      const now = new Date().toISOString()
      const status = input.status ?? 'todo'
      const current = qc.getQueryData<Task[]>(key) ?? []
      const temp: Task = {
        id: tempId,
        key: `${projectKey}-…`,
        number: 0,
        project_id: projectId,
        title: input.title,
        description: input.description ?? '',
        status,
        priority: input.priority ?? 'medium',
        assignee_id: input.assignee_id ?? null,
        due_date: input.due_date ?? null,
        position: endOfColumn(current, status),
        created_at: now,
        updated_at: now,
        completed_at: status === 'done' ? now : null,
      }
      return apply({ type: 'task/added', task: temp })
    },
    onSuccess: (task, { tempId }) =>
      qc.setQueryData<Task[]>(
        key,
        (old) => old && [...boardReducer(old, { type: 'task/saved', tempId, task })],
      ),
    onError: (error, _v, snapshot) => rollback(snapshot, "Couldn't create the task", error),
    onSettled: settle,
  })

  const update = useMutation({
    mutationKey,
    mutationFn: (v: { taskId: number; patch: TaskPatch }) =>
      api.updateTask(orgId, v.taskId, v.patch),
    onMutate: ({ taskId, patch }) => {
      const current = qc.getQueryData<Task[]>(key) ?? []
      const task = current.find((t) => t.id === taskId)
      const changes: Partial<Omit<Task, 'id'>> = { ...patch }
      if (task && patch.status && patch.status !== task.status) {
        // Same rule as the server: a status change through the form puts the card last.
        changes.position = endOfColumn(current, patch.status)
        changes.completed_at = patch.status === 'done' ? new Date().toISOString() : null
      }
      return apply({ type: 'task/updated', taskId, changes })
    },
    onError: (error, _v, snapshot) => rollback(snapshot, "Couldn't save the task", error),
    onSettled: settle,
  })

  const remove = useMutation({
    mutationKey,
    mutationFn: (taskId: number) => api.deleteTask(orgId, taskId),
    onMutate: (taskId) => apply({ type: 'task/removed', taskId }),
    onError: (error, _v, snapshot) => rollback(snapshot, "Couldn't delete the task", error),
    onSettled: settle,
  })

  return { move, create, update, remove }
}
