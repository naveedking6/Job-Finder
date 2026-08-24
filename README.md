# AI Job Finder / AI Sales Agent

A cloud-based system that discovers legitimate business opportunities,
evaluates them against a configurable service profile, engages potential
clients through explicitly permitted channels only, qualifies and scores
leads, and hands off serious clients to a human through a controlled
process — built for a solo freelance web developer, manageable entirely
from a browser.

**Status: early foundation (Round 1 of an incremental build).** See
[Roadmap](#roadmap) below for what exists today versus what's planned.

## Why this exists

Full reasoning for every technology choice — and the trade-offs each one
accepts — lives in [`docs/ADR.md`](./docs/ADR.md). Read that before
changing infrastructure decisions; it explains *why*, not just *what*.

## Compliance, stated up front

This system does not scrape, auto-bid, or auto-message on platforms whose
Terms of Service prohibit it (Upwork, Fiverr, Freelancer, LinkedIn, and
similar are seeded as **disabled** by default). The policy engine
(`packages/policy-engine`, built in a later round) is a hard gate every
connector must pass through — not a configuration suggestion. See ADR
section 8 and the `platforms` table in the schema.

## Project structure

```
ai-sales-agent/
├── apps/
│   ├── api/            # Fastify backend (health check only so far)
│   └── dashboard/       # Next.js dashboard — not yet scaffolded
├── packages/
│   ├── database/         # Prisma schema, migrations, client singleton
│   ├── shared/             # Cross-package types, enums, scoring logic
│   ├── ai-core/             # AI provider abstraction — not yet built
│   ├── connectors/           # Source connector framework — not yet built
│   └── policy-engine/         # Platform compliance engine — not yet built
├── docs/
│   ├── ADR.md                  # Architecture Decision Record
│   └── ENVIRONMENT.md           # Every env var explained
├── .github/workflows/
│   └── ci.yml                    # Typecheck, test, schema validation
├── .env.example
└── package.json                    # pnpm workspace root
```

## Quick start (local development)

Requires Node.js 20+ and pnpm.

```bash
pnpm install
cp .env.example .env    # then fill in DATABASE_URL at minimum
pnpm -r typecheck
pnpm -r test
pnpm dev:api             # starts the API on http://localhost:3000/health
```

You'll need a Postgres database to actually run the API against real data
— either a free [Supabase](https://supabase.com) project (see ADR section
4) or any local/cloud Postgres instance, set as `DATABASE_URL`.

## Database migrations

Prisma's engine binaries couldn't be downloaded in the sandbox this repo
was originally built in, so schema validation and the initial migration
are generated in CI, against a real Postgres service container, not
locally — see the `validate-database-schema` job in
`.github/workflows/ci.yml` and ADR section 11. Once you have a real
`DATABASE_URL`, run:

```bash
pnpm db:migrate:dev   # generates/applies migrations against your DB
pnpm db:generate       # regenerates the Prisma client
```

## Roadmap

Building incrementally, each round a genuinely working (not decorative)
piece of the same production system:

- [x] **Round 1** — Architecture Decision Record, repo scaffold, full
      database schema, environment configuration, CI (typecheck + test +
      schema validation), initial tests.
- [ ] **Round 2** — Backend core API, authentication, settings.
- [ ] **Round 3** — Platform policy/compliance engine.
- [ ] **Round 4** — Connector framework, opportunity normalization,
      duplicate detection.
- [ ] **Round 5** — AI provider abstraction, relevance analysis.
- [ ] **Round 6** — Conversation memory, conversation state management.
- [ ] **Round 7** — Lead scoring, risk scoring.
- [ ] **Round 8** — Human handoff, WhatsApp handoff.
- [ ] **Round 9** — Dashboard, connected to the real backend (not a
      mockup).
- [ ] **Round 10** — Logging, expanded test coverage, deployment
      documentation and first real deploy.

## License

Private project — not licensed for external use or redistribution.
