# Architecture Decision Record — AI Job Finder / AI Sales Agent

Status: **Living document.** Updated every round as components are built. This
records the decisions made and *why*, not just the final state, so future
changes can be judged against the original reasoning.

---

## 1. Constraints that shaped every decision

- No local dev environment required on the operator's machine — browser +
  GitHub only.
- Very limited budget — free tier first, paid only where free tiers cannot
  reasonably support a real (if small) production system.
- Must not fake human behavior on platforms that prohibit automation
  (Upwork, Fiverr, Freelancer, LinkedIn). The policy engine is a first-class
  architectural layer, not a bolt-on.
- Must be genuinely production-oriented in structure, even though it will be
  built incrementally, round by round.

---

## 2. Language & tooling

**Decision: TypeScript everywhere (backend, dashboard, shared packages).**

Why: one language across the whole system means the database schema, API
contracts, and dashboard types can share a single source of truth (via the
`shared` package), which matters a lot for a solo-maintained system — fewer
places for the API and UI to silently drift apart.

**Decision: pnpm workspaces monorepo, not Nx/Turborepo.**

Why: pnpm workspaces alone are enough for a project this size. Nx/Turborepo
add real value at 10+ packages with complex build graphs; here they'd mostly
add config to maintain. Can migrate later if the graph grows — nothing here
locks that door shut.

**Decision: Vitest for testing.**

Why: native TS/ESM support with no transpile config, fast, and shares
config style with the rest of the modern TS ecosystem we're already using.

---

## 3. Backend framework

**Decision: Fastify (Node.js/TypeScript).**

Why over Express: built-in JSON-schema request/response validation (maps
cleanly onto the normalized opportunity/lead models this system is built
around), first-class async support, better default performance, and a
plugin architecture that fits the "connector" and "policy engine" concepts
in this spec (each becomes a Fastify plugin with a clear boundary).

---

## 4. Database

**Decision: PostgreSQL, hosted on Supabase's free tier.**

Why: relational data with real foreign keys is the right fit here
(opportunities → leads → conversations → messages → scores, all genuinely
relational, not document-shaped). Supabase specifically (over e.g. Neon or
raw RDS) because it adds a browser-based table editor and SQL console on
top of plain Postgres at no extra cost — directly satisfies "must be
manageable from a browser, not my machine."

**Free tier limits (documented honestly, not glossed over):** Supabase free
tier gives 500MB database storage, the project pauses after 1 week of
inactivity (auto-resumes on next request, brief cold-start delay), and a
shared compute pool. This is genuinely fine for early-stage lead volumes
(hundreds to low thousands of rows). Revisit if/when opportunity volume
grows past that — documented as a scaling trigger, not hidden.

**Decision: Prisma as ORM + migration tool.**

Why: schema-first, generates fully-typed client (feeds directly into the
TypeScript-everywhere decision above), and its migration files are plain
SQL under version control — auditable in GitHub, matches the "GitHub is the
source of truth" requirement.

---

## 5. Dashboard

**Decision: Next.js, hosted on Vercel's free tier.**

Why: server-rendered where useful (initial dashboard load with real data,
not a loading spinner), API routes available if a thin proxy layer is ever
needed, and Vercel's free tier is genuinely sufficient for an internal
single-operator dashboard. Deferred to a later round per the agreed
priority order — not built yet in Round 1.

---

## 6. Background work / automation triggers

This is the one piece of infrastructure that doesn't have an obvious free
"just works" answer, so it gets its own section.

**Decision: GitHub Actions scheduled workflows (`cron`) trigger discovery
and outreach cycles by calling protected API endpoints, instead of running
a persistent worker process.**

Why: a real always-on background worker (BullMQ + Redis, etc.) needs a
paid always-on host to stay reliable — that's real money for a feature that,
at this stage, only needs to run every N minutes, not continuously. GitHub
Actions cron is free (2,000 minutes/month on a free personal account,
generous for periodic HTTP calls), and it keeps the *trigger* mechanism
inside GitHub, which fits the "GitHub is the hub" requirement literally,
not just in spirit.

**Trade-off, stated plainly:** GitHub Actions cron has a documented ~5-15
minute scheduling slop (GitHub does not guarantee exact timing on free
runners) and a workflow minimum interval of 5 minutes. That's an accepted
trade-off for an early-stage lead-gen system — a job scan running "roughly
every 15 minutes" instead of "exactly every 15 minutes" doesn't lose leads.
If sub-minute automation timing ever becomes a real requirement, that's a
documented trigger to move to a paid always-on worker (e.g. a small Render
background worker, ~$7/mo tier) — not a default assumption.

**Decision: Backend API hosted on Render's free web service tier.**

Why: genuinely free, deploys straight from GitHub on push, supports
environment variables/secrets in its dashboard (no secrets in the repo).
**Documented limitation:** Render's free web services spin down after 15
minutes of inactivity and take ~30-50 seconds to cold-start on the next
request. Acceptable for an API that's mostly hit by scheduled GitHub Actions
and an internal dashboard, not a public-facing product needing instant
response. Documented as a scaling trigger for the paid tier ($7/mo) if
response-time requirements tighten.

---

## 7. AI provider abstraction

**Decision:** a provider-agnostic interface (`packages/ai-core`) with the
methods specified in the brief (`analyzeOpportunity`, `generateResponse`,
`scoreLead`, etc.), implemented as adapters. **Not implemented in Round 1**
— this is priority #9 in the agreed order. Recorded here so the database
schema (`ai_providers` table, configurable per-lead provider) is designed
to support it from the start, even though the adapters themselves come
later.

Initial adapters planned: Anthropic (Claude) and OpenAI, both pay-per-use
with no free tier — this is flagged honestly as a **paid component**, not
hidden behind "free tier" language. Cost is usage-based and small at low
lead volume (a handful of dollars/month for dozens of conversations), but
it is real money and the ADR should say so plainly rather than implying
everything in this system is free.

---

## 8. Platform policy engine

**Decision:** modeled as data, not code-per-platform. A `platforms` table
carries the boolean permission flags from the spec
(`automation_allowed`, `discovery_allowed`, `auto_message_allowed`,
`auto_comment_allowed`, `api_available`) plus a `compliance_notes` free-text
field recording *why* a platform is configured the way it is. The
`policy-engine` package reads this table and is the single gate every
connector must pass through before taking any outbound action — it is not
something an individual connector can bypass by its own logic.

**Concretely, for the platforms explicitly named in the brief:** Upwork,
Fiverr, Freelancer, and LinkedIn will ship pre-seeded with
`automation_allowed = false`, `discovery_allowed = false`,
`api_available = false`, and a compliance note explaining why (their ToS
prohibit third-party automation and none offer a public opportunity-search
API). This is a seed default, editable later, but it does not default to
"on."

---

## 9. Security

- No secrets committed to the repo, ever. `.env.example` documents every
  variable name and purpose with placeholder values only.
- Real secrets live in: GitHub Actions Secrets (for CI/scheduled triggers),
  Render's environment variable dashboard (API), Vercel's environment
  variable dashboard (dashboard app), Supabase's connection string (kept in
  the above, never in git).
- Any token pasted into a chat session during development is treated as
  compromised on sight and flagged for revocation — this applies to GitHub
  PATs used to push code during this build process specifically.

---

## 10. Testing & CI

**Decision:** Vitest for unit tests, colocated with source
(`*.test.ts` next to the file it tests) rather than a separate top-level
`tests/` tree — keeps test and implementation changes in the same diff.
GitHub Actions runs typecheck + test on every push. Linting deferred to
Round 2 (ESLint config is a small addition, not blocking Round 1
correctness).

---

## 11. What Round 1 deliberately does NOT include

Documented explicitly so nothing here is mistaken for an oversight:

- No backend endpoints beyond `/health` — API surface starts Round 2 per
  the agreed priority order.
- No AI provider calls — abstraction is designed for in the schema, built
  Round 2 area (~priority #9).
- No dashboard — Next.js app scaffolded but empty, per the agreed
  "foundation before UI" priority.
- No live Supabase/Render/Vercel accounts created — this round produces
  everything needed to deploy, but actual account creation and first
  deploy requires the operator to click through those services' own
  sign-up flows (cannot be done from this sandbox). Documented as a
  manual step in `docs/DEPLOYMENT.md` when that doc is written.

---

## 12. Round 2 addendum — API-level testing under the same sandbox constraint

Round 2 introduced routes that touch the real Prisma client (`app.prisma`
is wired up via a Fastify plugin). This means `buildApp()` itself now
requires a generated Prisma client to even construct — so, consistent
with section 11's Prisma-binary limitation, **any test that calls
`buildApp()` can only run where the client has been generated**, i.e. in
CI, not in the dev sandbox this repo was originally built in.

**Decision:** split the API's test suite in two:
- `pnpm test` — pure-logic unit tests only (`src/lib/*.test.ts`, and any
  future route logic factored out as testable-without-a-DB functions).
  These run everywhere, including the original dev sandbox.
- `pnpm test:integration` — real end-to-end tests (`src/integration/*.integration.test.ts`)
  that call `buildApp()` and exercise actual routes against a real
  Postgres instance. These only run in CI's `validate-database-schema`
  job, immediately after that job migrates and seeds a fresh Postgres
  service container — so they're testing the exact same schema/migration
  state that was just validated, not a stale assumption about it.

This is a stronger verification story than mocking Prisma would have
been — the integration suite genuinely exercises auth, portfolio CRUD,
settings validation, and the automation start/stop emergency-stop
mechanism against a real database, not a test double standing in for one.

## 13. Round 2 addendum — no public signup

The seed script creates the admin user record but deliberately does NOT
set a usable password (it's seeded with a random, discarded hash). This
avoids a known default credential ever existing in version control. The
real password must be set via a one-time authenticated action once
Supabase/Render are actually provisioned — documented as a manual step
in `docs/DEPLOYMENT.md` when that's written (Round 10). There is no
public `/auth/register` endpoint — this is a single-operator internal
system, not a multi-tenant product, consistent with the brief's emphasis
on simplicity and this ADR's security section.

