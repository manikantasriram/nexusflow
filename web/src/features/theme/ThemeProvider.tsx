import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { useLocalStorage } from '../../hooks/useLocalStorage'
import { isThemeChoice, ThemeContext, type ThemeChoice, type ThemeValue } from './themeContext'

const query = '(prefers-color-scheme: dark)'

function subscribe(onChange: () => void) {
  const media = window.matchMedia?.(query)
  media?.addEventListener('change', onChange)
  return () => media?.removeEventListener('change', onChange)
}
const systemIsDark = () => window.matchMedia?.(query).matches ?? false

/** Light, dark, or follow the operating system; the choice is remembered per browser. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useLocalStorage<ThemeChoice>('nf.theme', 'system', isThemeChoice)
  const osDark = useSyncExternalStore(subscribe, systemIsDark, () => false)
  const resolved = choice === 'system' ? (osDark ? 'dark' : 'light') : choice

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark')
    document.documentElement.style.colorScheme = resolved
  }, [resolved])

  const value = useMemo<ThemeValue>(
    () => ({ choice, resolved, setChoice }),
    [choice, resolved, setChoice],
  )
  return <ThemeContext value={value}>{children}</ThemeContext>
}
