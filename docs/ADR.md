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

## 14. Round 3 — the policy engine as a genuinely separate, pure package

The brief calls for the policy/compliance engine to be "a core
architectural layer, not an afterthought." Concretely, that shaped a
specific implementation choice: `packages/policy-engine` has **zero
database dependency**. It takes plain-object inputs (a platform's policy
flags, a rule's config, already-known counts/timestamps) and returns a
decision — it never queries anything itself.

Why this matters beyond code cleanliness: it means the actual policy
*logic* — every combination of platform flags, the emergency-stop
interaction, rate limits, cooldowns, and working-hours math (including
timezone conversion and overnight-window wraparound) — is fully unit
tested and verified in this sandbox, the same one that can't reach
Prisma's binary CDN. 46 tests, all passing, covering the exact rules a
future connector will be bound by. The database-touching part (fetching
a real Platform row, real AutomationRule rows, real ActivityLog counts)
is a thin route handler (`GET /platforms/:id/policy-check`) that maps
live data onto the pure function's input shape — that mapping is what
gets tested in CI's integration suite, not the decision logic itself,
which was already proven correct independently.

**Note on `WORKING_HOURS` evaluation:** uses `luxon` for timezone
conversion rather than hand-rolled UTC-offset arithmetic — DST and
half-hour-offset timezones make manual date math a genuine correctness
risk, and this is exactly the kind of logic that should fail loudly on a
bad config (invalid timezone → denies/fails closed) rather than silently
misbehave.

**Note on rule "windows":** the current `GET /platforms/:id/policy-check`
route computes `actionsInWindow` as "count since start of today" for
*all* rate/daily-style rules on a platform, rather than giving each rule
its own distinct window. This is a deliberate, documented simplification
— there is no real outreach traffic yet (connectors don't exist until
Round 4), so per-rule window precision would be precision without a
purpose right now. Flagged here as a known refinement for when Round 4
actually generates traffic this matters for.

## 15. Round 4 — connector framework, normalization, duplicate detection

Same pattern as the policy engine: `packages/connectors` keeps the parts
worth testing thoroughly (`normalize()` for each source, duplicate
detection, pipeline orchestration) database-free and pure, while the one
genuinely untestable-in-CI part (`fetch()` — real network calls to
third-party APIs) stays thin and isolated.

**Real connectors implemented:** RemoteOK (public JSON feed) and We Work
Remotely (public RSS feed) — both seeded `discoveryAllowed=true` per the
ADR's compliance stance (section 8), since both platforms publish these
feeds specifically for programmatic consumption. Each connector's
`normalize()` is tested against a fixture modeled on the platform's real,
documented response format — including edge cases each format actually
has in practice (RemoteOK's leading legal-notice object that isn't a
real job; We Work Remotely's "Company: Title" convention breaking for
titles that don't follow it, and its RSS parser collapsing a single-item
feed into a bare object rather than a one-element array, a genuine
common XML-parsing footgun that's explicitly tested against).

**The own-website contact form is deliberately NOT a `Connector`.** The
interface's `fetch()`/`normalize()` split assumes a poll-based source;
the contact form is push-based (a visitor submits it once, there's
nothing to poll). Forcing it into the same interface would mean a
`fetch()` that does nothing, which is worse than just not implementing
an interface that doesn't fit. It's a plain normalize function called
directly by `POST /intake/contact-form`.

**Duplicate detection has two distinct layers**, matching two distinct
real-world cases:
- **Exact** (same platform, same external id) — enforced at the database
  level by the existing unique constraint (Round 1), and checked
  proactively by the pipeline before insertion so routine "already
  ingested" cases don't generate noisy constraint-violation errors.
- **Fuzzy, cross-platform** (the same job posted on RemoteOK AND We Work
  Remotely, with different ids) — a Jaccard word-set similarity on
  titles. This does NOT exclude anything automatically; it flags a
  match with a similarity score for a human (or the AI relevance engine,
  Round 5) to weigh in on, since "similar title" isn't proof of being
  the literal same listing and silently dropping data on a fuzzy
  heuristic alone would be the wrong default.

**What Round 4 does NOT test, and why:** the "successfully fetched real
data" path of `POST /connectors/:platformKey/run` calls real third-party
APIs. Testing that reliably in CI would mean depending on RemoteOK's/We
Work Remotely's uptime and exact current response format — a flaky-test
risk, not a real correctness signal. What IS integration-tested: the
policy-deny path (which never calls `fetch()` at all, so it's fully
testable without network dependency), auth gating, and the fully
self-contained contact-form intake route.

## 16. Round 5 — AI provider abstraction and the relevance engine

Same pattern as Rounds 3 and 4: keep everything worth testing pure and
database/network-free, keep the one part that genuinely costs real money
and can't be tested without live credentials (the actual API call) as
thin as possible.

**Fully implemented this round:** `analyzeOpportunity` — the brief's "AI
Relevance Engine". Both real adapters (Anthropic, OpenAI) share the exact
same prompt-building and response-parsing logic
(`capabilities/analyze-opportunity.ts`); the adapter classes themselves
are just "call the SDK, hand the text to the shared parser". That shared
logic is what's actually tested — 19 tests covering not just the happy
path but the real reliability risks of LLM output: markdown code fences
wrapping the JSON despite being told not to (a well-documented, common
model behavior, not a hypothetical), a hallucinated service slug that
was never actually offered (filtered out, not trusted), and various
malformed-response shapes throwing a distinct `AiResponseParseError`
rather than a generic crash.

**Scaffolded, not yet implemented:** `generateResponse`,
`extractRequirements`, `summarizeConversation` (Round 6),
`scoreLead`, `analyzeRisk` (Round 7), `recommendSolution` (Round 6+ —
the *initial* solution recommendation happens inside `analyzeOpportunity`
itself, since generating relevance + a recommended approach in one call
is both cheaper and more coherent than two separate calls; the standalone
method exists for re-recommending later, once real requirements have
been gathered). Real adapters throw a clear `NotImplementedYetError`
naming which round covers each — never a silent no-op or a fake
response pretending to be real analysis.

**`selectPortfolio` is deliberately NOT part of the `AiProvider`
interface at all.** Once `analyzeOpportunity` has already determined
which services an opportunity matches, picking relevant portfolio items
is a plain category filter — there's no reasoning task left for an LLM
to do. Spending a paid API call on that would be cost for its own sake,
not sophistication. It's a pure function (`selectRelevantPortfolioItems`)
instead, and the real `POST /opportunities/:id/analyze` route calls it
directly after getting the AI's service-slug matches back.

**The mock provider is not decorative.** `MockAiProvider` implements all
8 methods with simple deterministic (rule-based, keyword-overlap) logic
— zero network calls, zero cost. This is what CI's integration suite
actually exercises via `getConfiguredAiProvider()`'s safe default (see
below), so the real database wiring — fetching an opportunity, calling
whatever provider is configured, updating the row, matching portfolio
items, logging to ActivityLog — is genuinely integration-tested end to
end, just not against a live paid API. It also stands in reasonably well
for the brief's "Local/Hosted OpenAI-compatible provider" option during
development, with that distinction stated plainly rather than implied:
it's a rule-based mock, not a real local model.

**Safe-by-default provider selection.** `DEFAULT_AI_PROVIDER` defaults to
`"mock"` if unset — a real Anthropic/OpenAI key being present in the
environment is not, by itself, enough to trigger real (paid) API calls.
Both `DEFAULT_AI_PROVIDER` and the matching key must be explicitly set.
This mirrors the same "off by default, explicit opt-in" posture as the
`AUTOMATION_ENABLED` emergency-stop flag from Round 2.

**What Round 5 does NOT test, and why:** calling a real Anthropic or
OpenAI API and getting back a genuine model response. Same reasoning as
Round 4's connectors — that would mean either committing to spending real
money on every CI run, or depending on a live third-party service's
uptime for test reliability. What's tested instead is everything
deterministic: prompt construction, response parsing against realistic
(including deliberately malformed) fixture text, the hallucination
guard, and the full database-integration path running against the mock
provider.

## 17. Round 6 — conversation memory and conversation state management

**A real design bug caught during this round, worth documenting
explicitly rather than quietly fixing:** the `Conversation` model
(schema.prisma) has no `stage` field — only a lifecycle `status`
(ACTIVE/PAUSED/HUMAN_TAKEOVER/CLOSED). The `stage: ConversationStage`
field the brief's `CONVERSATION_STAGES` progression actually refers to
lives on `Lead`. The first draft of `POST /conversations/:id/messages`
read and wrote `conversation.stage` throughout — which doesn't exist —
caught by manually re-reading the actual schema before pushing, not by
CI (this class of error is invisible to typecheck in this sandbox, since
Prisma's stub types can't validate field names without the generated
client — see section 11). The fix: state machine input/output now reads
and writes `conversation.lead.stage`, and the route's test fixtures were
corrected to set `stage` on `Lead.create()`, not the nonexistent field on
`Conversation.create()`. This is exactly the kind of mistake the honest
"only claim what's actually verified" posture in this ADR exists to
catch — it's noted here instead of silently disappearing from the
history.

**The conversation stage state machine
(`packages/shared/src/conversation/conversation-state.ts`) is pure and
forward-only**, same design philosophy as the policy engine. A
conversation only advances along `CONVERSATION_STAGES`' declared order;
an event that would move it to an earlier stage than it's already
reached is a no-op, not a regression — real conversations don't happen
in a strict linear order (a client might mention budget before
requirements are fully captured), and the state machine shouldn't
un-advance progress because of that. Four stages (`HUMAN_HANDOFF`,
`CONVERTED`, `LOST`, `ARCHIVED`) are locked exits: once entered, no
ordinary event moves the conversation out of them automatically. A
module-load-time check throws immediately if a new `ConversationStage`
is ever added to `enums.ts` without updating this state machine to
account for it — this can't silently drift out of sync.

**Conversation memory merging
(`packages/shared/src/conversation/conversation-memory.ts`) is the
concrete mechanism behind the brief's "never repeatedly ask for
information already provided."** Merging is additive: a turn that
doesn't mention a client's name doesn't clear a name already captured in
an earlier turn; array fields (features discussed, questions answered,
shared portfolio items) accumulate and dedupe rather than overwrite; the
free-form `requirements` object merges key-by-key, so a new turn adding
one detail doesn't erase unrelated details from a previous turn. Tested
with an explicit 4-turn simulated conversation asserting the full
accumulated picture survives to the end.

**`generateResponse`, `extractRequirements`, and
`summarizeConversation`** are now genuinely implemented in both real
adapters, following the exact same pattern as `analyzeOpportunity`
(Round 5): pure prompt-building + response-parsing logic shared between
Anthropic and OpenAI, tested against realistic (including deliberately
malformed) fixture responses, with the actual paid API call kept as thin
as possible. The duplicated JSON-extraction/parsing logic from Round 5
was refactored into a shared `capabilities/parse-utils.ts` once a third
capability needed the identical pattern — extracted after the
duplication actually existed, not speculatively upfront.

**`POST /conversations/:id/messages` is the real conversation-agent
loop**: persists the incoming message, extracts new requirements from
just that message (the merge logic is what accumulates history — see
above), fires the appropriate state-machine events, generates an AI
reply via the configured provider, and refreshes the conversation's
rolling summary every turn. That per-turn summary refresh is a
deliberate simplicity-over-optimization trade-off, stated plainly: it's
an extra AI call on every single message, not the cheapest possible
design (e.g. refreshing every N messages instead) — reasonable to
revisit once real usage volume exists to actually observe the cost
impact, not worth premature optimization against a system with zero
real traffic yet.

**A message from a human operator does not also trigger an AI reply.**
Sending a `HUMAN`-sender message marks the conversation
`HUMAN_TAKEOVER` and stops there — the system doesn't generate an
automated response to its own operator's message, and (implicitly) a
conversation in human-takeover mode is a natural place for future
automation-guard logic (Round 8's human handoff) to check before the AI
ever replies again.

**Same honest testing boundary as Rounds 4 and 5**: the mock provider is
what the integration suite exercises end-to-end (persisting messages,
merging memory, advancing stage, updating the lead, refreshing the
summary — all against real Postgres), not a live Anthropic/OpenAI call.

**Addendum, same round:** the `conversation.stage` bug described above
was actually only partially fixed on the first pass — two more
references survived in the integration test file itself (a redundant
assertion checking `.stage` on a fetched `Conversation` row, and a
`before?.stage` capture used for the "never regresses" test), which CI
caught and this sandbox's local typecheck couldn't (same root cause:
Prisma's stub types can't validate field names without a generated
client). Fixed by checking `Lead.stage` instead, and by removing the
redundant conversation-level check entirely (the lead-level assertion
right after it already covers the same thing).

**Also caught this round, by CI's real Postgres-backed integration
tests specifically:** `MockAiProvider.extractRequirements`'s original
implementation always returned a non-empty result (echoing the raw
message text back under a `rawText` key), which meant every single
client message — including pure filler like "Just checking in." —
looked like it contained a genuinely new requirement. That falsely
advanced the conversation stage every turn and made the memory-merge
integration test's "nothing changed" assertion fail, because something
genuinely had changed (the echoed raw text differs message to message).
Fixed by giving the mock a slightly more realistic extraction heuristic
(regex-based detection of project-type/budget/timeline mentions,
returning empty when nothing matches) — this is exactly the kind of bug
that only a real database-integration test, not a unit test against the
mock in isolation, would surface: the mock's own unit tests were
individually fine, but its behavior was unrealistic in a way that only
showed up once real state (conversation stage, accumulated memory) was
actually threaded through multiple turns.

## 18. Round 7 — lead scoring and risk scoring

**Deliberately a hybrid, not a pure AI judgment call.** Same reasoning
as every prior round: `packages/shared/src/scoring-signals/` computes
fast, free, deterministic facts from structured conversation data —
does the conversation have a discussed budget, detailed requirements,
multiple client responses, does the client's language match known
scam-adjacent or payment-avoidance patterns, is there a budget/scope
mismatch. These map directly onto the brief's own listed positive lead
signals and negative risk signals. The AI's `scoreLead`/`analyzeRisk`
calls (now genuinely implemented in both real adapters) receive these
signals as grounding context rather than reasoning about lead quality
from raw conversation text with nothing to anchor to — the model's job
is the nuanced judgment a checklist can't capture (tone, specificity,
genuine intent), not re-deriving facts a rule already established for
free.

**Risk scoring stays deliberately conservative and clearly framed.** The
brief is explicit that this isn't an accusation of fraud, just a caution
level — that framing is baked directly into the system prompt
(`capabilities/analyze-risk.ts`), and the risk-signal pattern list
(`risk-signals.ts`) sticks to well-known, low-ambiguity phrases rather
than a broad list that would drift into false-positiving legitimate
international clients (a test explicitly guards against this: a client
who runs a cryptocurrency business is not itself a risk signal — only
the specific "crypto only" *payment demand* phrase is). Urgency language
alone is weighted low and explicitly can't push a lead into the
high-risk band by itself, since plenty of legitimate clients are
genuinely in a hurry.

**A real regex bug caught by its own test, immediately**: the initial
scam-language pattern's trailing word-boundary (`\b`) silently failed to
match "lottery winning" because the pattern only spelled "winn" — the
boundary check landed between two word characters ("n" and "i"), which
`\b` can never satisfy. Caught the moment the test ran, before this ever
reached CI — exactly the value of writing the test alongside the logic
rather than after.

**The scoring endpoint is the concrete tie-in between this round and
Round 6's state machine**: crossing the configured
`LEAD_SCORE_HANDOFF_THRESHOLD` fires a real `HOT_LEAD_THRESHOLD` event
through `advanceStage`, not just a stored number nobody acts on. Risk
crossing `RISK_SCORE_REVIEW_THRESHOLD` sets a `flaggedForReview` flag in
the response — full human-handoff mechanics (notifications, dashboard
surfacing) are Round 8, but the scoring layer already produces the
signal that round will act on.

Same honest testing boundary as every prior round: real Anthropic/OpenAI
calls aren't exercised in CI; the mock provider (now scoring
proportionally from whatever signals it's handed, rather than a flat
stub) is what the integration suite runs against, genuinely exercising
the full path — rule-based signal detection, database fetch, AI call,
database update, history-row creation, and state-machine advancement —
against real Postgres.

## 19. Round 8 — human handoff and WhatsApp handoff

**Four of the brief's six handoff triggers are implemented; two are
explicitly deferred, not faked.** `packages/shared/src/handoff/handoff-trigger.ts`
covers: lead score crossing the configured threshold, risk score
crossing the review threshold, the client explicitly requesting direct
contact, and the client expressing readiness to start — all four are
concretely groundable from signals Rounds 6-7 already compute. "A
pricing decision requires my approval" and "a technical decision exceeds
the AI's authority" are NOT implemented — they'd need the AI to actively
reason about specific requests against `PricingRule` data, and that
table exists in the schema but isn't wired into any live route yet.
Stated here plainly as a real gap and a reasonable future extension,
rather than papered over with a vague catch-all trigger that would claim
coverage it doesn't have.

**This round supersedes part of Round 7's behavior, on purpose.** Round
7 had a lead crossing the score threshold advance only to the `HOT_LEAD`
stage. Round 8 replaces that: crossing the same threshold now fires a
real `HANDOFF_TRIGGERED` event, escalating straight to `HUMAN_HANDOFF`
— which is what the brief actually asks for ("At that point, create a
human handoff"), not just a label change. The Round 7 integration test
that asserted the old `HOT_LEAD` behavior was updated to assert the new
`HUMAN_HANDOFF` behavior, with the reasoning for the change stated in
the test itself, not silently altered.

**"I do not want notifications for every lead" is enforced structurally,
not just by convention.** `shouldTriggerHandoff`'s result is only acted
on (state transition, `Notification` row, `handoffAt`/`handoffReason`
set) when the lead isn't already in a locked stage
(`isLockedStage` from Round 6's state machine). Scoring the same lead
again after it's already been handed off produces zero new
notifications — tested explicitly: score once (one notification), score
again with no new signal (still exactly one notification, not two).

**The WhatsApp link is never generated from an unconfigured placeholder.**
The seeded default `WHATSAPP_BUSINESS_NUMBER` (`+10000000000`) is a
placeholder, not a real contact — `assembleHandoff` explicitly checks
for it and returns `null` for `whatsAppLink` rather than producing a
misleading link to a fake number. A real link only appears once the
operator has actually configured a genuine number via `PUT /settings`.

**The handoff package covers every field the brief lists**: Client
Name, Platform, Country, Project Summary, Requirements, Budget,
Timeline, Lead Score, Risk Score, Conversation Summary, Recommended
Next Action, and Contact Details when legitimately available (pulled
from a linked `Client` row if one exists, falling back to
`authorMetadata` captured at intake time — e.g. the email a contact-form
submitter provided in Round 4 — never fabricated). The recommended next
action logic prioritizes a risk warning above everything else, even for
an otherwise-hot lead — the brief's caution that high-risk leads should
"never automatically receive sensitive information" needs to be the
first thing a human reviewing the package sees, not buried under a
generic "follow up promptly" line.

Same honest testing boundary as every prior round: MockAiProvider is
what CI's integration suite runs against. 350 tests passing locally
project-wide before this round's integration suite even runs (which
only executes in CI, against real Postgres).
