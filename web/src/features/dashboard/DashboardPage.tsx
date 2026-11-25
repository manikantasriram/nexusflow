import { Link } from 'react-router'
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  PageSpinner,
  ProgressBar,
} from '../../components/ui'
import {
  dueLabel,
  daysUntil,
  formatTime,
  percent,
  PRIORITY_LABEL,
  STATUS_LABEL,
} from '../../lib/format'
import { useMyTasks, useProjects, useStats } from '../../lib/queries'
import { PRIORITIES, TASK_STATUSES, type Stats } from '../../lib/types'
import { useAuth } from '../auth/authContext'
import { PRIORITY_BADGE, PRIORITY_BAR, STATUS_DOT } from '../board/meta'
import { useOrg } from '../org/orgContext'

export function DashboardPage() {
  const { orgId, organization } = useOrg()
  const { user } = useAuth()
  const stats = useStats(orgId)
  const firstName = user?.full_name.split(' ')[0] ?? 'there'

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`Hi ${firstName}`}
        description={`Here's where ${organization.name} stands today.`}
      />
      {stats.isPending ? (
        <PageSpinner label="Loading dashboard" />
      ) : stats.isError ? (
        <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />
      ) : (
        <Overview stats={stats.data} />
      )}
    </div>
  )
}

function Overview({ stats }: { stats: Stats }) {
  const { orgId } = useOrg()
  const open = stats.total_tasks - stats.by_status.done

  return (
    <div className="space-y-6">
      <section aria-label="Key numbers" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Open tasks" value={open} />
        <Tile label="Overdue" value={stats.overdue} tone={stats.overdue > 0 ? 'bad' : undefined} />
        <Tile label="Due in the next 7 days" value={stats.due_this_week} />
        <Tile label="Done in the last 7 days" value={stats.completed_last_7_days} tone="good" />
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-3">
          <h2 className="text-sm font-semibold">Work by status</h2>
          <StatusBar stats={stats} />
          <h2 className="mt-8 text-sm font-semibold">Open work by priority</h2>
          <PriorityBars stats={stats} />
        </Card>
        <Card className="p-5 lg:col-span-2">
          <MyTasks />
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Projects</h2>
          <Link
            to={`/o/${orgId}/projects`}
            className="text-brand-600 dark:text-brand-500 text-sm font-medium hover:underline"
          >
            All projects
          </Link>
        </div>
        {stats.projects.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">No projects yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">
            {stats.projects.map((p) => {
              const done = percent(p.done, p.total)
              return (
                <li
                  key={p.id}
                  className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2 py-3 sm:grid-cols-[14rem_1fr_6rem]"
                >
                  <Link
                    to={`/o/${orgId}/projects/${p.id}`}
                    className="min-w-0 truncate font-medium hover:underline"
                  >
                    <span className="mr-2 font-mono text-xs text-zinc-400">{p.key}</span>
                    {p.name}
                  </Link>
                  <span className="text-right text-sm text-zinc-500 tabular-nums sm:order-last">
                    {p.done}/{p.total} done
                  </span>
                  <div className="col-span-2 sm:col-span-1">
                    <ProgressBar value={done} label={`${p.name}: ${done}% done`} />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <p className="text-xs text-zinc-500">
        Numbers as of {formatTime(stats.generated_at)}
        {stats.cached ? ' (served from cache; any change refreshes them)' : ''}.
      </p>
    </div>
  )
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'bad' }) {
  const color =
    tone === 'bad'
      ? 'text-red-600 dark:text-red-400'
      : tone === 'good'
        ? 'text-emerald-600 dark:text-emerald-400'
        : ''
  return (
    <Card className="p-5">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tracking-tight tabular-nums ${color}`}>{value}</p>
    </Card>
  )
}

function StatusBar({ stats }: { stats: Stats }) {
  if (stats.total_tasks === 0) return <p className="mt-4 text-sm text-zinc-500">No tasks yet.</p>
  return (
    <>
      <div
        className="mt-4 flex h-3 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
        aria-hidden="true"
      >
        {TASK_STATUSES.map((s) => (
          <div
            key={s}
            className={STATUS_DOT[s]}
            style={{
              width: `${percent(stats.by_status[s], stats.total_tasks)}%`,
            }}
          />
        ))}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TASK_STATUSES.map((s) => (
          <li key={s} className="text-sm">
            <span className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
              <span className={`size-2.5 rounded-full ${STATUS_DOT[s]}`} aria-hidden="true" />
              {STATUS_LABEL[s]}
            </span>
            <span className="mt-0.5 block text-lg font-semibold tabular-nums">
              {stats.by_status[s]}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

function PriorityBars({ stats }: { stats: Stats }) {
  const max = Math.max(1, ...PRIORITIES.map((p) => stats.by_priority[p]))
  return (
    <ul className="mt-4 space-y-2.5">
      {[...PRIORITIES].reverse().map((p) => (
        <li key={p} className="grid grid-cols-[4.5rem_1fr_2rem] items-center gap-3 text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">{PRIORITY_LABEL[p]}</span>
          <span
            className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
            aria-hidden="true"
          >
            <span
              className={`block h-full rounded-full ${PRIORITY_BAR[p]}`}
              style={{ width: `${(stats.by_priority[p] / max) * 100}%` }}
            />
          </span>
          <span className="text-right font-medium tabular-nums">{stats.by_priority[p]}</span>
        </li>
      ))}
    </ul>
  )
}

function MyTasks() {
  const { orgId } = useOrg()
  const mine = useMyTasks(orgId)
  const projects = useProjects(orgId)
  const projectName = (id: number) => projects.data?.find((p) => p.id === id)?.name ?? ''

  return (
    <>
      <h2 className="text-sm font-semibold">Assigned to you</h2>
      {mine.isPending ? (
        <PageSpinner label="Loading your tasks" />
      ) : mine.isError ? (
        <ErrorState error={mine.error} onRetry={() => void mine.refetch()} />
      ) : mine.data.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="Nothing on your plate">
            Open tasks assigned to you show up here.
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
          {mine.data.slice(0, 8).map((t) => (
            <li key={t.id}>
              <Link
                to={`/o/${orgId}/projects/${t.project_id}?task=${t.id}`}
                className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              >
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${STATUS_DOT[t.status]}`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{t.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-zinc-500">
                    {t.key} · {projectName(t.project_id)} · {STATUS_LABEL[t.status]}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <Badge className={PRIORITY_BADGE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Badge>
                  {t.due_date && (
                    <span
                      className={`text-xs ${daysUntil(t.due_date) < 0 ? 'font-medium text-red-600 dark:text-red-400' : 'text-zinc-500'}`}
                    >
                      {dueLabel(t.due_date)}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
