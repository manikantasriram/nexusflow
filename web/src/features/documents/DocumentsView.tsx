import { useState, type DragEvent } from 'react'
import { Link, useOutletContext } from 'react-router'
import { FileIcon, UploadIcon } from '../../components/icons'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageSpinner,
  Spinner,
} from '../../components/ui'
import { formatBytes, formatDate } from '../../lib/format'
import {
  useDeleteDocument,
  useDocument,
  useDocuments,
  useTasksFromDocument,
  useUploadDocument,
} from '../../lib/queries'
import type { DocumentDetail } from '../../lib/types'
import { errorMessage, toast } from '../../stores/toast'
import { useOrg } from '../org/orgContext'
import type { ProjectOutletContext } from '../projects/ProjectLayout'

const ACCEPT = '.txt,.md,.markdown,.csv,.log,.pdf'

export function DocumentsView() {
  const { project } = useOutletContext<ProjectOutletContext>()
  const { orgId } = useOrg()
  const docs = useDocuments(orgId, project.id)
  const upload = useUploadDocument(orgId, project.id)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const send = (file: File | undefined) => {
    if (!file) return
    upload.mutate(file, {
      onSuccess: (doc) => {
        setSelectedId(doc.id)
        toast.success(`Analysed ${doc.filename}`)
      },
      onError: (e) => toast.error(`Upload failed: ${errorMessage(e)}`),
    })
  }

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setDragOver(false)
    send(e.dataTransfer.files[0])
  }

  const activeId = selectedId ?? docs.data?.[0]?.id ?? null

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <div className="space-y-4">
        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`has-focus-visible:outline-brand-500 flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors has-focus-visible:outline-2 ${
            dragOver
              ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
              : 'border-zinc-300 hover:border-zinc-400 dark:border-zinc-700'
          }`}
        >
          {upload.isPending ? (
            <Spinner className="size-6" label="Uploading" />
          ) : (
            <UploadIcon className="size-6 text-zinc-400" />
          )}
          <span className="mt-2 text-sm font-medium">
            {upload.isPending ? 'Analysing…' : 'Upload a document'}
          </span>
          <span className="mt-1 text-xs text-zinc-500">
            Drop a file here or click. .txt, .md, .csv or .pdf, up to 2 MB.
          </span>
          <input
            type="file"
            accept={ACCEPT}
            className="sr-only"
            disabled={upload.isPending}
            onChange={(e) => {
              send(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>

        {docs.isPending ? (
          <PageSpinner label="Loading documents" />
        ) : docs.isError ? (
          <ErrorState error={docs.error} onRetry={() => void docs.refetch()} />
        ) : docs.data.length === 0 ? (
          <EmptyState title="No documents yet">
            Upload meeting notes or a spec: NexusFlow pulls out a summary, keywords and to-dos.
          </EmptyState>
        ) : (
          <ul className="space-y-2" aria-label="Documents">
            {docs.data.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(d.id)}
                  aria-current={d.id === activeId ? 'true' : undefined}
                  className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                    d.id === activeId
                      ? 'border-brand-500 bg-white dark:bg-zinc-900'
                      : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900'
                  }`}
                >
                  <FileIcon className="mt-0.5 size-5 shrink-0 text-zinc-400" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{d.filename}</span>
                    <span className="mt-0.5 block text-xs text-zinc-500">
                      {d.word_count.toLocaleString()} words · {formatBytes(d.size_bytes)} ·{' '}
                      {formatDate(d.created_at)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        {activeId !== null && (
          <DocumentPanel key={activeId} docId={activeId} onDeleted={() => setSelectedId(null)} />
        )}
      </div>
    </div>
  )
}

function DocumentPanel({ docId, onDeleted }: { docId: number; onDeleted: () => void }) {
  const { orgId } = useOrg()
  const doc = useDocument(orgId, docId)
  if (doc.isPending) return <PageSpinner label="Loading document" />
  if (doc.isError) return <ErrorState error={doc.error} onRetry={() => void doc.refetch()} />
  return <DocumentDetails doc={doc.data} onDeleted={onDeleted} />
}

function DocumentDetails({ doc, onDeleted }: { doc: DocumentDetail; onDeleted: () => void }) {
  const { orgId } = useOrg()
  const toTasks = useTasksFromDocument(orgId, doc.project_id)
  const remove = useDeleteDocument(orgId, doc.project_id)
  const [picked, setPicked] = useState<Set<number>>(
    () => new Set(doc.action_items.map((_, i) => i)),
  )
  const [created, setCreated] = useState(false)

  const toggle = (i: number) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  const createTasks = () => {
    const items = doc.action_items.filter((_, i) => picked.has(i))
    toTasks.mutate(
      { docId: doc.id, items },
      {
        onSuccess: (tasks) => {
          setCreated(true)
          toast.success(
            `Added ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'} to the board`,
          )
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    )
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{doc.filename}</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {doc.word_count.toLocaleString()} words · {formatBytes(doc.size_bytes)} · uploaded{' '}
            {formatDate(doc.created_at)}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-red-600 dark:text-red-400"
          busy={remove.isPending}
          onClick={() =>
            remove.mutate(doc.id, {
              onSuccess: () => {
                toast.success(`Deleted ${doc.filename}`)
                onDeleted()
              },
              onError: (e) => toast.error(errorMessage(e)),
            })
          }
        >
          Delete
        </Button>
      </div>

      <section className="mt-6">
        <h3 className="text-sm font-semibold">Summary</h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          {doc.summary || 'This document is too short to summarise.'}
        </p>
      </section>

      {doc.keywords.length > 0 && (
        <section className="mt-6">
          <h3 className="text-sm font-semibold">Keywords</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {doc.keywords.map((k) => (
              <li key={k}>
                <Badge className="bg-brand-50 text-brand-700 ring-brand-500/20 dark:bg-brand-500/10 dark:text-brand-100">
                  {k}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <h3 className="text-sm font-semibold">Action items</h3>
        {doc.action_items.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            None found. Lines like “- [ ] Book the venue”, “TODO: …” or “Action: …” are picked up as
            to-dos.
          </p>
        ) : (
          <>
            <fieldset className="mt-2 space-y-2">
              <legend className="sr-only">Choose which action items become tasks</legend>
              {doc.action_items.map((item, i) => (
                <label key={item} className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={picked.has(i)}
                    onChange={() => toggle(i)}
                    className="accent-brand-600 mt-0.5 size-4 rounded border-zinc-300"
                  />
                  {item}
                </label>
              ))}
            </fieldset>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                disabled={picked.size === 0}
                busy={toTasks.isPending}
                onClick={createTasks}
              >
                Create {picked.size} {picked.size === 1 ? 'task' : 'tasks'}
              </Button>
              {created && (
                <Link
                  to=".."
                  relative="path"
                  className="text-brand-600 dark:text-brand-500 text-sm font-medium hover:underline"
                >
                  View them on the board
                </Link>
              )}
            </div>
          </>
        )}
      </section>

      <details className="mt-6">
        <summary className="cursor-pointer text-sm font-semibold">Extracted text</summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-zinc-50 p-3 text-xs whitespace-pre-wrap dark:bg-zinc-950">
          {doc.text_preview}
        </pre>
      </details>
    </Card>
  )
}
