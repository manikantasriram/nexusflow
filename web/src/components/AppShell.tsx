import { useEffect, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../features/auth/authContext'
import { useOrg } from '../features/org/orgContext'
import { useTheme, type ThemeChoice } from '../features/theme/themeContext'
import { ROLE_LABEL } from '../lib/format'
import { useProjects } from '../lib/queries'
import { useUi } from '../stores/ui'
import {
  DashboardIcon,
  FolderIcon,
  LogoMark,
  MenuIcon,
  MonitorIcon,
  MoonIcon,
  SettingsIcon,
  SignOutIcon,
  SunIcon,
} from './icons'
import { Avatar } from './ui'

const navClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-100'
      : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
  }`

export function AppShell({ children }: { children: ReactNode }) {
  const { menuOpen, setMenuOpen } = useUi()
  const location = useLocation()

  useEffect(() => setMenuOpen(false), [location.pathname, setMenuOpen])
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen, setMenuOpen])

  return (
    <div className="min-h-dvh lg:flex">
      <a
        href="#main"
        className="bg-brand-600 sr-only z-50 rounded-lg px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden dark:border-zinc-800 dark:bg-zinc-950/90">
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-expanded={menuOpen}
          aria-controls="sidebar"
          aria-label="Menu"
          className="-ml-1 rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <MenuIcon />
        </button>
        <Brand />
      </header>

      {menuOpen && (
        <div
          className="fixed inset-0 z-30 bg-zinc-950/40 lg:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        id="sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-zinc-200 bg-white transition-transform lg:visible lg:sticky lg:top-0 lg:h-dvh lg:w-64 lg:translate-x-0 dark:border-zinc-800 dark:bg-zinc-950 ${
          menuOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'
        }`}
      >
        <Sidebar />
      </aside>

      <main
        id="main"
        tabIndex={-1}
        className="min-w-0 flex-1 px-4 py-6 outline-none sm:px-6 lg:px-10 lg:py-8"
      >
        {children}
      </main>
    </div>
  )
}

function Brand() {
  return (
    <span className="flex items-center gap-2 text-base font-semibold tracking-tight">
      <LogoMark />
      NexusFlow
    </span>
  )
}

function Sidebar() {
  const { orgId, organization, role } = useOrg()
  const { user, memberships, signOut } = useAuth()
  const projects = useProjects(orgId)
  const navigate = useNavigate()
  const base = `/o/${orgId}`

  return (
    <>
      <div className="hidden px-5 pt-5 lg:block">
        <Link to={base} className="rounded-lg">
          <Brand />
        </Link>
      </div>

      <div className="px-3 pt-5">
        <label
          htmlFor="org-switcher"
          className="px-2 text-xs font-medium tracking-wide text-zinc-500 uppercase"
        >
          Organization
        </label>
        <select
          id="org-switcher"
          value={orgId}
          onChange={(e) => navigate(`/o/${e.target.value}`)}
          className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-900"
        >
          {memberships.map((m) => (
            <option key={m.organization.id} value={m.organization.id}>
              {m.organization.name}
            </option>
          ))}
        </select>
        <p className="mt-1.5 px-2 text-xs text-zinc-500">
          You are {role === 'admin' || role === 'owner' ? 'an' : 'a'}{' '}
          {ROLE_LABEL[role].toLowerCase()} of {organization.name}.
        </p>
      </div>

      <nav aria-label="Main" className="mt-5 flex-1 overflow-y-auto px-3">
        <ul className="space-y-1">
          <li>
            <NavLink to={base} end className={navClass}>
              <DashboardIcon /> Dashboard
            </NavLink>
          </li>
          <li>
            <NavLink to={`${base}/projects`} end className={navClass}>
              <FolderIcon /> Projects
            </NavLink>
          </li>
          <li>
            <NavLink to={`${base}/settings`} className={navClass}>
              <SettingsIcon /> Settings
            </NavLink>
          </li>
        </ul>

        {projects.data && projects.data.length > 0 && (
          <div className="mt-6">
            <h2 className="px-3 text-xs font-medium tracking-wide text-zinc-500 uppercase">
              Projects
            </h2>
            <ul className="mt-2 space-y-0.5">
              {projects.data.map((p) => (
                <li key={p.id}>
                  <NavLink to={`${base}/projects/${p.id}`} className={navClass}>
                    <span className="w-9 shrink-0 font-mono text-xs text-zinc-400">{p.key}</span>
                    <span className="truncate">{p.name}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>

      <div className="space-y-3 border-t border-zinc-200 p-3 dark:border-zinc-800">
        <ThemeSwitch />
        {user && (
          <div className="flex items-center gap-3 px-2">
            <Avatar name={user.full_name} id={user.id} size="size-8" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.full_name}</p>
              <p className="truncate text-xs text-zinc-500">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              aria-label="Sign out"
              title="Sign out"
            >
              <SignOutIcon />
            </button>
          </div>
        )}
      </div>
    </>
  )
}

const THEMES: { value: ThemeChoice; label: string; icon: typeof SunIcon }[] = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'System', icon: MonitorIcon },
]

function ThemeSwitch() {
  const { choice, setChoice } = useTheme()
  return (
    <fieldset className="flex rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">
      <legend className="sr-only">Theme</legend>
      {THEMES.map(({ value, label, icon: ThemeIcon }) => (
        <label
          key={value}
          className={`has-focus-visible:outline-brand-500 flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium has-focus-visible:outline-2 ${
            choice === value
              ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          <input
            type="radio"
            name="theme"
            value={value}
            checked={choice === value}
            onChange={() => setChoice(value)}
            className="sr-only"
          />
          <ThemeIcon className="size-4" />
          {label}
        </label>
      ))}
    </fieldset>
  )
}
