// Server state: what to fetch, how it's cached, and what to refetch after a change.
//
// Query keys are hierarchical: ['org', 1, 'projects', 7, 'tasks']. Invalidating ['org', 1]
// refetches everything for organization 1; invalidating a longer key is more targeted.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type { ProjectInput, Role } from './types'

export const keys = {
  me: ['me'] as const,
  org: (orgId: number) => ['org', orgId] as const,
  stats: (orgId: number) => ['org', orgId, 'stats'] as const,
  members: (orgId: number) => ['org', orgId, 'members'] as const,
  projects: (orgId: number) => ['org', orgId, 'projects'] as const,
  project: (orgId: number, projectId: number) => ['org', orgId, 'projects', projectId] as const,
  tasks: (orgId: number, projectId: number) =>
    ['org', orgId, 'projects', projectId, 'tasks'] as const,
  documents: (orgId: number, projectId: number) =>
    ['org', orgId, 'projects', projectId, 'documents'] as const,
  myTasks: (orgId: number) => ['org', orgId, 'my-tasks'] as const,
  document: (orgId: number, docId: number) => ['org', orgId, 'documents', docId] as const,
}

// --- reads ------------------------------------------------------------------------------------

export const useStats = (orgId: number) =>
  useQuery({ queryKey: keys.stats(orgId), queryFn: () => api.stats(orgId) })

export const useMembers = (orgId: number) =>
  useQuery({
    queryKey: keys.members(orgId),
    queryFn: () => api.members(orgId),
    staleTime: 60_000,
  })

export const useProjects = (orgId: number) =>
  useQuery({
    queryKey: keys.projects(orgId),
    queryFn: () => api.projects(orgId),
  })

export const useProject = (orgId: number, projectId: number) =>
  useQuery({
    queryKey: keys.project(orgId, projectId),
    queryFn: () => api.project(orgId, projectId),
  })

export const useTasks = (orgId: number, projectId: number) =>
  useQuery({
    queryKey: keys.tasks(orgId, projectId),
    queryFn: () => api.tasks(orgId, projectId),
  })

export const useMyTasks = (orgId: number) =>
  useQuery({ queryKey: keys.myTasks(orgId), queryFn: () => api.myTasks(orgId) })

export const useDocuments = (orgId: number, projectId: number) =>
  useQuery({
    queryKey: keys.documents(orgId, projectId),
    queryFn: () => api.documents(orgId, projectId),
  })

export const useDocument = (orgId: number, docId: number | null) =>
  useQuery({
    queryKey: keys.document(orgId, docId ?? 0),
    queryFn: () => api.document(orgId, docId!),
    enabled: docId !== null,
  })

// --- writes -----------------------------------------------------------------------------------

export function useCreateProject(orgId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ProjectInput) => api.createProject(orgId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.projects(orgId), exact: true })
      void qc.invalidateQueries({ queryKey: keys.stats(orgId) })
    },
  })
}

export function useUpdateProject(orgId: number, projectId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<ProjectInput>) => api.updateProject(orgId, projectId, input),
    onSuccess: (project) => {
      qc.setQueryData(keys.project(orgId, projectId), project)
      void qc.invalidateQueries({ queryKey: keys.projects(orgId), exact: true })
    },
  })
}

export function useDeleteProject(orgId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (projectId: number) => api.deleteProject(orgId, projectId),
    onSuccess: (_void, projectId) => {
      qc.removeQueries({ queryKey: keys.project(orgId, projectId) })
      void qc.invalidateQueries({ queryKey: keys.projects(orgId), exact: true })
      void qc.invalidateQueries({ queryKey: keys.stats(orgId) })
      void qc.invalidateQueries({ queryKey: keys.myTasks(orgId) })
    },
  })
}

export function useCreateOrganization() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => api.createOrganization(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  })
}

export function useRenameOrganization(orgId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => api.renameOrganization(orgId, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  })
}

export function useMemberActions(orgId: number) {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: keys.members(orgId) })
  return {
    add: useMutation({
      mutationFn: ({ email, role }: { email: string; role: Role }) =>
        api.addMember(orgId, email, role),
      onSuccess: refresh,
    }),
    changeRole: useMutation({
      mutationFn: ({ userId, role }: { userId: number; role: Role }) =>
        api.changeRole(orgId, userId, role),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (userId: number) => api.removeMember(orgId, userId),
      onSuccess: refresh,
    }),
  }
}

export function useUploadDocument(orgId: number, projectId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => api.uploadDocument(orgId, projectId, file),
    onSuccess: (doc) => {
      qc.setQueryData(keys.document(orgId, doc.id), doc)
      void qc.invalidateQueries({ queryKey: keys.documents(orgId, projectId) })
    },
  })
}

export function useDeleteDocument(orgId: number, projectId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (docId: number) => api.deleteDocument(orgId, docId),
    onSuccess: (_void, docId) => {
      qc.removeQueries({ queryKey: keys.document(orgId, docId) })
      void qc.invalidateQueries({ queryKey: keys.documents(orgId, projectId) })
    },
  })
}

export function useTasksFromDocument(orgId: number, projectId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ docId, items }: { docId: number; items: string[] }) =>
      api.tasksFromDocument(orgId, docId, items),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.tasks(orgId, projectId) })
      void qc.invalidateQueries({ queryKey: keys.projects(orgId), exact: true })
      void qc.invalidateQueries({ queryKey: keys.stats(orgId) })
    },
  })
}
