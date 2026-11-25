import { useCallback, useEffect, useState } from 'react'

/**
 * Like useState, but the value survives reloads (stored as JSON in localStorage).
 *
 * Generic over T, so `useLocalStorage<'light' | 'dark'>('theme', 'light')` is typed end to end.
 * Storage can be unavailable (private mode, blocked site data) or hold garbage; in both cases
 * the hook quietly falls back to `initial`. Pass `validate` to reject stored values of the
 * wrong shape (for example after the app's format changed).
 */
export function useLocalStorage<T>(
  key: string,
  initial: T,
  validate?: (value: unknown) => value is T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => read(key, initial, validate))

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* storage full or blocked: keep working in memory */
    }
  }, [key, value])

  // Keep tabs in sync: another tab changing the same key updates this one.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) setValue(read(key, initial, validate))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [key, initial, validate])

  const set = useCallback((next: T | ((prev: T) => T)) => setValue(next), [])
  return [value, set]
}

function read<T>(key: string, initial: T, validate?: (value: unknown) => value is T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return initial
    const parsed: unknown = JSON.parse(raw)
    if (validate && !validate(parsed)) return initial
    return parsed as T
  } catch {
    return initial
  }
}
