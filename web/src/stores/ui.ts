// Client-only UI state (Zustand): board filters, which dialog is open, the mobile menu.
// Server data never lives here; that's TanStack Query's job.

import { create } from 'zustand'
import type { Priority, TaskStatus } from '../lib/types'

export interface BoardFilters {
  search: string
  priority: Priority | 'all'
  assignee: 'all' | 'me' | 'unassigned'
}

export type TaskDialog =
  { mode: 'create'; status: TaskStatus } | { mode: 'edit'; taskId: number } | null

const NO_FILTERS: BoardFilters = {
  search: '',
  priority: 'all',
  assignee: 'all',
}

interface UiState {
  filters: BoardFilters
  setFilter: <K extends keyof BoardFilters>(key: K, value: BoardFilters[K]) => void
  resetFilters: () => void
  taskDialog: TaskDialog
  openCreateTask: (status: TaskStatus) => void
  openEditTask: (taskId: number) => void
  closeTaskDialog: () => void
  menuOpen: boolean
  setMenuOpen: (open: boolean) => void
}

export const useUi = create<UiState>()((set) => ({
  filters: NO_FILTERS,
  setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),
  resetFilters: () => set({ filters: NO_FILTERS }),
  taskDialog: null,
  openCreateTask: (status) => set({ taskDialog: { mode: 'create', status } }),
  openEditTask: (taskId) => set({ taskDialog: { mode: 'edit', taskId } }),
  closeTaskDialog: () => set({ taskDialog: null }),
  menuOpen: false,
  setMenuOpen: (menuOpen) => set({ menuOpen }),
}))

export const hasActiveFilters = (f: BoardFilters) =>
  f.search.trim() !== '' || f.priority !== 'all' || f.assignee !== 'all'
