# Environment Variables

Every variable below is also listed, with a placeholder value, in
`.env.example` at the repo root. This document explains *what each one is
for* and *where it's set in production*.

Never commit a real `.env` file. It's in `.gitignore` for exactly this
reason.

| Variable | Used by | Required | Production location | Notes |
|---|---|---|---|---|
| `DATABASE_URL` | api, database package (Prisma) | Yes | Render env vars | Supabase connection string. Get it from the Supabase project's Settings → Database → Connection string (use the "connection pooling" string, not the direct one, for the API's runtime connections). |
| `PORT` | api | No (defaults to 3000) | Render sets this automatically | Render injects its own `PORT` — the app reads whatever is provided. |
| `HOST` | api | No (defaults to 0.0.0.0) | — | Must be `0.0.0.0` in any containerized/cloud host, not `localhost`. |
| `NODE_ENV` | api | No | Render env vars | `production` in deployed environments. |
| `LOG_LEVEL` | api | No (defaults to `info`) | Render env vars | Fastify/pino log level. `debug` for troubleshooting. |
| `JWT_SECRET` | api (auth) | Yes | Render env vars (Secret) | Generate with e.g. `openssl rand -hex 32`. Rotate if ever exposed. |
| `JWT_EXPIRES_IN` | api | No | — | Token lifetime, e.g. `7d`. |
| `ANTHROPIC_API_KEY` | ai-core (Round 2+) | Only if using the Anthropic adapter | Render env vars (Secret) | Pay-per-use, no free tier — see ADR section 7. |
| `OPENAI_API_KEY` | ai-core (Round 2+) | Only if using the OpenAI adapter | Render env vars (Secret) | Same cost note as above. |
| `DEFAULT_AI_PROVIDER` | ai-core (Round 2+) | No | — | Which adapter key (`anthropic` / `openai`) to use when a lead has no provider override. |
| `WHATSAPP_BUSINESS_NUMBER` | api (Round 2+, handoff) | Only for WhatsApp handoff links | Render env vars | Used to build `https://wa.me/<number>` links — see ADR / brief section on WhatsApp handoff. |
| `AUTOMATION_ENABLED` | *(currently unused by app code)* | No | — | The global emergency-stop flag from the brief is implemented as a database-backed setting (`GET/PUT /settings`, `POST /automation/start`\|`stop`), seeded to `false` by `prisma/seed.ts` — **not** read from this env var. This entry is kept as a placeholder in `.env.example` in case a process-level override is added later; right now setting it has no effect. |
| `SCHEDULER_SHARED_SECRET` | api + GitHub Actions (Round 2+) | Yes once scheduled workflows exist | Render env vars **and** GitHub Actions Secrets (must match in both places) | Lets the API verify that a request claiming to be the scheduled discovery/outreach trigger actually came from the GitHub Actions cron job, not an arbitrary caller. |

## Where secrets live, concretely

- **Local development:** your own `.env` file (gitignored).
- **API (Render):** Render project → Environment → Environment Variables.
- **Dashboard (Vercel), once built:** Vercel project → Settings →
  Environment Variables.
- **Scheduled GitHub Actions workflows, once built:** repo → Settings →
  Secrets and variables → Actions.
- **Database:** the connection string itself is a secret (contains a
  password) — treat `DATABASE_URL` with the same care as an API key.
