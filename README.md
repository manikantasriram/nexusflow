# NexusFlow

A multi-tenant B2B project and document intelligence app. Organizations invite their team with
roles, run projects on a Kanban board, and upload documents that NexusFlow reads: it writes a
summary, pulls out keywords, finds the to-dos, and turns them into tasks with one click.

**Stack:** React 19 · TypeScript (strict) · Vite · Tailwind CSS 4 · React Router · TanStack Query ·
Zustand · React Hook Form + Zod · Vitest + Testing Library + MSW — FastAPI · Pydantic v2 ·
SQLAlchemy 2 · Alembic · PostgreSQL · Redis · Pytest — Docker Compose · GitHub Actions · Vercel ·
Render · Neon

## What it does

- **Organizations and roles.** Sign up and you own a new organization. Owners and admins add
  people as owner, admin or member; each role sees only the actions it's allowed. Users can
  belong to several organizations and switch between them.
- **Strict tenant isolation.** Every query is scoped to the organization in the URL, and the API
  answers 404 (not 403) for anything outside your organizations, so ids can't even be probed.
- **Kanban board.** Drag cards with the mouse, or move them entirely by keyboard (Space to pick
  up, arrows to move, Space to drop, Escape to cancel) with screen-reader announcements. Moves
  appear instantly (optimistic updates) and roll back with a message if the server refuses.
- **Validated forms.** Projects and tasks are checked in the browser with Zod and again on the
  server with Pydantic; server errors land next to the field they belong to.
- **Dashboard.** Open, overdue and due-soon counts, status and priority breakdowns, progress per
  project and "assigned to me", computed with aggregate queries and cached in Redis.
- **Document intelligence.** Upload `.txt`, `.md`, `.csv` or `.pdf`. NexusFlow extracts the text,
  scores sentences to write an extractive summary, lists keywords, and detects action items
  (`- [ ] …`, `TODO: …`, `Action: …`) that you can turn into tasks.
- **Secure sessions.** Short-lived access tokens kept only in memory, refresh tokens in an
  httpOnly cookie with rotation and reuse detection, and login rate limiting.

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    UI[React app<br/>TanStack Query cache<br/>Zustand UI state]
  end
  UI -- "/api (same origin)" --> Proxy[Vercel rewrite / nginx / Vite proxy]
  Proxy --> API[FastAPI<br/>routers → services]
  API --> PG[(PostgreSQL<br/>orgs, users, projects,<br/>tasks, documents)]
  API --> R[(Redis<br/>dashboard cache,<br/>login rate limits)]
```

The browser always calls `/api` on its own origin. In development Vite proxies it, in Docker
nginx does, and in production a Vercel rewrite forwards it to Render. One origin means the
refresh-token cookie works with `SameSite=Lax` and no cross-site cookie configuration.

The API is layered: **routers** handle HTTP only, **services** hold the business rules and every
query, and **dependencies** (`OrgMember`, `OrgAdmin`) resolve "who is calling, in which
organization, with which role" before an endpoint runs. Errors share one JSON shape:
`{"error": {"code", "message", "fields?"}}`.

## Data model

```mermaid
erDiagram
  ORGANIZATION ||--o{ MEMBERSHIP : has
  USER ||--o{ MEMBERSHIP : has
  ORGANIZATION ||--o{ PROJECT : owns
  PROJECT ||--o{ TASK : contains
  PROJECT ||--o{ DOCUMENT : contains
  USER ||--o{ TASK : "assigned to"
  USER ||--o{ REFRESH_TOKEN : holds

  MEMBERSHIP { int organization_id int user_id string role }
  PROJECT { int organization_id string key int task_counter }
  TASK { int organization_id int project_id int number string status string priority float position date due_date }
  DOCUMENT { int organization_id int project_id text text json keywords json action_items }
  REFRESH_TOKEN { string token_hash string family_id datetime expires_at datetime revoked_at }
```

Indexes follow the real queries: `(organization_id, project_id, status, position)` for the board,
`(organization_id, assignee_id, status)` for "assigned to me", and `(organization_id, due_date)`
for the dashboard's due-date counts.

## Run it locally

### Option 1: everything in Docker

```bash
docker compose up --build
```

Open http://localhost:8080. The API's interactive docs are at http://localhost:8000/docs.

### Option 2: without Docker (SQLite, in-memory cache)

```bash
# API
cd api
python -m venv .venv
.venv/Scripts/activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload     # http://localhost:8000

# Web, in a second terminal
cd web
npm install
npm run dev                       # http://localhost:5173
```

### Option 3: frontend only, against a mock API

```bash
cd web && npm run dev:mock
```

MSW answers every request in the browser, so no backend is needed.

### Demo accounts

All use the password `demo-pass-123`.

| Email | Role |
|---|---|
| owner@demo.nexusflow.dev | Owner of Acme Robotics, member of Globex Labs |
| admin@demo.nexusflow.dev | Admin of Acme Robotics |
| member@demo.nexusflow.dev | Member of Acme Robotics |
| other@demo.nexusflow.dev | Owner of Globex Labs only (sees nothing in Acme) |

To try the document features, upload [docs/sample-meeting-notes.md](docs/sample-meeting-notes.md)
on a project's Documents tab.

## Tests and checks

```bash
cd api && pytest && ruff check . && ruff format --check .
cd web && npm test && npm run lint && npm run typecheck && npm run build
```

- **API (49 tests):** sign-up, login, refresh rotation and reuse detection, rate limiting,
  expired and forged tokens; tenant isolation (an outsider gets 404 for every read and write in
  another organization); every role rule; task numbering, ordering, renumbering and filters;
  stats caching and invalidation; document analysis, uploads and limits.
- **Web (40 tests):** the board reducer and keyboard-drag reducer; the API client's single-flight
  token refresh; form validation and server errors; sign-in flows; and the board end to end
  against MSW, including an optimistic move that rolls back when the server fails.

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs all of this on every push and pull
request, runs the API tests against real PostgreSQL and Redis, checks that the Alembic migrations
match the models exactly, and builds both Docker images.

## Measured numbers

Numbers on this page come only from runs you can repeat. To measure query times with and
without the task indexes on 100,000 tasks per organization:

```bash
cd api
DATABASE_URL=postgresql+psycopg://nexusflow:nexusflow@localhost:5432/nexusflow \
  python -m app.bench --tasks 100000 --compare
```

It seeds its own organizations (never touching demo data), measures p50 and p95 for the board,
"assigned to me" and overdue-count queries, and prints a Markdown table to paste here.

| Query | Without indexes p50 / p95 (ms) | With indexes p50 / p95 (ms) |
|---|---|---|
| _Run the command above against PostgreSQL and paste the results._ | | |

## Design decisions

- **Refresh-token rotation with reuse detection.** Each refresh revokes the token it used and
  issues the next in the same family. If an already-used token comes back after a 10-second grace
  window, the whole family is revoked: someone copied it. The grace window covers two tabs
  refreshing at the same moment.
- **Fractional positions.** A moved card gets a position halfway between its new neighbours, so a
  move writes one row. When two neighbours get too close to split, that column is renumbered
  once. The frontend reducer uses the same arithmetic, so optimistic order matches the server.
- **One reducer, two uses.** `boardReducer` is a pure function over a discriminated union of
  actions, with a `never` check so an unhandled action won't compile. It applies optimistic
  updates to the TanStack Query cache and draws the live preview while a card is carried by
  keyboard.
- **Cache invalidation over expiry.** Dashboard stats are cached for 60 seconds, but any write in
  the organization deletes the cached copy, so numbers are never stale for long. If Redis is down,
  the API computes directly instead of failing.
- **Explainable document analysis.** Keyword frequency and sentence scoring rather than a language
  model: fast, free, deterministic and easy to test. The service boundary
  (`services/text_analysis.py`) is where an LLM could be plugged in later.

## Deploy

1. **Database:** create a PostgreSQL database on Neon and copy its connection string.
2. **Redis:** create a Redis instance (Render Key Value or Upstash) and copy its URL.
3. **API on Render:** create a Blueprint from [render.yaml](render.yaml), then set `DATABASE_URL`
   and `REDIS_URL`. Render generates `JWT_SECRET`. Migrations and demo data run on start.
4. **Web on Vercel:** import the repo with `web` as the root directory. In
   [web/vercel.json](web/vercel.json), point the `/api` rewrite at your Render URL, and set
   `CORS_ORIGINS` on Render to your Vercel URL.

Check the current free tiers before signing up.

## Project layout

```
api/
  app/
    routers/        HTTP endpoints (auth, orgs, projects, tasks, documents)
    services/       business rules and every query, always scoped by organization
    models.py       SQLAlchemy tables      schemas.py   request/response shapes
    deps.py         current user, tenant and role checks
    cache.py        Redis or in-memory cache      ratelimit.py   login limits
    seed.py         demo data      bench.py   index benchmark
  alembic/          migrations
  tests/            pytest suite
web/
  src/
    features/       auth, board, dashboard, documents, org, projects, settings, theme
    lib/            API client, query hooks, types, formatting
    stores/         Zustand UI and toast stores
    mocks/          MSW mock API (tests and dev:mock)
docs/               sample document
```

## Known limits

- People must already have an account before they can be added to an organization; there are no
  email invitations yet.
- Changes made by teammates appear on the next refetch, not live (no WebSockets).
- Document analysis handles plain text, Markdown, CSV and text-based PDFs; scanned PDFs need OCR.
