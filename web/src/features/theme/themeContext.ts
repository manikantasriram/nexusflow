import { createContext, useContext } from 'react'

export type ThemeChoice = 'light' | 'dark' | 'system'

export interface ThemeValue {
  choice: ThemeChoice
  /** What is actually shown once "system" is resolved. */
  resolved: 'light' | 'dark'
  setChoice: (choice: ThemeChoice) => void
}

export const ThemeContext = createContext<ThemeValue | null>(null)

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>')
  return value
}

export const isThemeChoice = (v: unknown): v is ThemeChoice =>
  v === 'light' || v === 'dark' || v === 'system'
