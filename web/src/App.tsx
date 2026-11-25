import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { Route, Routes } from 'react-router'
import { PageSpinner } from './components/ui'
import { LoginPage } from './features/auth/LoginPage'
import { RegisterPage } from './features/auth/RegisterPage'
import { RedirectIfSignedIn, RequireAuth } from './features/auth/RequireAuth'
import { HomePage } from './features/org/HomePage'
import { OrgLayout } from './features/org/OrgLayout'
import { NotFoundPage } from './pages/NotFoundPage'

// Signed-in pages download only when first opened, so the sign-in screen loads fast.
function named<T extends string>(load: () => Promise<Record<T, ComponentType>>, name: T) {
  return lazy(() => load().then((m) => ({ default: m[name] })))
}

const DashboardPage = named(() => import('./features/dashboard/DashboardPage'), 'DashboardPage')
const ProjectsPage = named(() => import('./features/projects/ProjectsPage'), 'ProjectsPage')
const NewProjectPage = named(() => import('./features/projects/NewProjectPage'), 'NewProjectPage')
const ProjectLayout = named(() => import('./features/projects/ProjectLayout'), 'ProjectLayout')
const BoardView = named(() => import('./features/board/BoardView'), 'BoardView')
const DocumentsView = named(() => import('./features/documents/DocumentsView'), 'DocumentsView')
const ProjectSettingsView = named(
  () => import('./features/projects/ProjectSettingsView'),
  'ProjectSettingsView',
)
const SettingsPage = named(() => import('./features/settings/SettingsPage'), 'SettingsPage')

const page = (element: ReactNode) => (
  <Suspense fallback={<PageSpinner label="Loading page" />}>{element}</Suspense>
)

export function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfSignedIn>
            <LoginPage />
          </RedirectIfSignedIn>
        }
      />
      <Route
        path="/register"
        element={
          <RedirectIfSignedIn>
            <RegisterPage />
          </RedirectIfSignedIn>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        }
      />
      <Route
        path="/o/:orgId"
        element={
          <RequireAuth>
            <OrgLayout />
          </RequireAuth>
        }
      >
        <Route index element={page(<DashboardPage />)} />
        <Route path="projects" element={page(<ProjectsPage />)} />
        <Route path="projects/new" element={page(<NewProjectPage />)} />
        <Route path="projects/:projectId" element={page(<ProjectLayout />)}>
          <Route index element={page(<BoardView />)} />
          <Route path="documents" element={page(<DocumentsView />)} />
          <Route path="settings" element={page(<ProjectSettingsView />)} />
        </Route>
        <Route path="settings" element={page(<SettingsPage />)} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
