# MailPilot

MailPilot is an AI assistant for Gmail. You sign in with Google, browse your inbox, and ask an agent built on Gemini to search, read, summarise, organise, or reply to your email in plain language. Any action that changes your mailbox or sends mail needs your approval first.

## Contents

- [Features](#features)
- [Repository layout](#repository-layout)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [Database](#database)
- [Authentication](#authentication)
- [The agent](#the-agent)
- [API reference](#api-reference)
- [Testing and linting](#testing-and-linting)
- [Deploying to production](#deploying-to-production)
- [Troubleshooting](#troubleshooting)

## Features

- **Google sign-in.** OAuth with offline access. Google tokens are encrypted at rest.
- **Inbox.** List, search, read, and act on emails and threads (read/unread, star, archive, trash, restore, important, labels), and write new mail.
- **Assistant.** A chat agent that uses Gmail tools. It can answer questions about your inbox ("how many unread emails from Amazon this week?"), read and summarise messages, and propose actions.
- **Approval before changes.** Sending, replying, and every mailbox change become a pending approval card. Nothing runs until you approve it.
- **Bulk actions.** The agent can target every email that matches a Gmail query (for example, "trash all promotions older than 30 days"). It shows a count and a preview before you approve.
- **Email analysis.** A single endpoint returns a summary, category, priority, sentiment, action items, and deadlines for an email.
- **Rate-limit aware.** Gmail calls are throttled per user, and Gemini models fall back to the next one in the list when a quota runs out.
- **Light and dark themes.**

## Repository layout

This is a pnpm workspace with two apps:

```
.
├── apps/
│   ├── backend/              NestJS API, port 3000
│   │   ├── prisma/           Prisma schema and migrations
│   │   ├── prisma.config.ts  Prisma CLI config (picks the env file and migration URL)
│   │   └── src/
│   │       ├── auth/         Google OAuth, session JWT, SessionGuard, token encryption
│   │       ├── gmail/        Gmail API wrapper, parser, batch operations, rate limiting
│   │       ├── ai/           One-off email analysis with Gemini
│   │       ├── agent/        Chat agent: tool definitions, read tools, approvals, actions
│   │       ├── prisma/       PrismaService
│   │       └── generated/    Generated Prisma client (from `prisma generate`)
│   └── frontend/             React 19 + TypeScript + Vite, port 5173
│       └── src/
│           ├── pages/        Login, Inbox, Assistant
│           ├── components/   Compose, Toast, ThemeToggle, ...
│           ├── api.ts        Typed API client
│           └── config.ts     Reads VITE_API_URL
├── package.json              Root scripts that run against both apps
└── pnpm-workspace.yaml
```

## Tech stack

| Area | Technology |
|---|---|
| Backend | NestJS 10, TypeScript, Swagger (`@nestjs/swagger`) |
| AI | Google Gemini via `@google/genai` (default `gemini-2.5-flash`, then `gemini-2.5-flash-lite`) |
| Email | Gmail API via `googleapis` |
| Database | PostgreSQL on [Neon](https://neon.tech), Prisma 7 with `@prisma/adapter-pg` |
| Auth | Google OAuth 2.0, session JWT (`@nestjs/jwt`), AES-256-GCM encryption for stored tokens |
| Frontend | React 19, Vite 7, TypeScript, `lucide-react` icons |
| Tooling | pnpm workspaces, Jest, ESLint, Prettier |

## Getting started

### Prerequisites

- **Node.js** 20 or newer
- **pnpm.** The version is pinned in `package.json` (`packageManager`). Run `corepack enable` to get it.
- **A Postgres database.** A free Neon project works.
- **A Google Cloud project** with:
  - the **Gmail API** turned on
  - an **OAuth consent screen**. While the app is in testing, add your own account as a test user.
  - an **OAuth 2.0 Client ID** of type *Web application*, with the authorised redirect URI `http://localhost:3000/auth/google/callback`
- **A Gemini API key** from [Google AI Studio](https://aistudio.google.com/apikey)

### Setup

```sh
pnpm install                                                   # also runs `prisma generate`

cp apps/backend/.env.example  apps/backend/.env.development    # then fill in the secrets
cp apps/frontend/.env.example apps/frontend/.env.development

pnpm db:migrate                                                # apply migrations to the dev database
pnpm dev                                                       # start backend and frontend together
```

Then open:

- the app at <http://localhost:5173>
- the API docs (Swagger UI) at <http://localhost:3000/api>

To call the API from Swagger, sign in through the frontend. Copy the session token (stored in the browser's `localStorage`) into Swagger's **Authorize** dialog.

## Environment variables

All `.env*` files are gitignored. Only each app's `.env.example` is committed. The backend loads `.env.${NODE_ENV}` first and falls back to `.env`. The Prisma CLI picks its file the same way.

### Backend (`apps/backend`)

| Variable | Required | Description |
|---|---|---|
| `PORT` | no | HTTP port. Default `3000`. |
| `FRONTEND_URL` | yes | Frontend origin. Used for the CORS allow-list and as the redirect target after Google login. |
| `GOOGLE_CLIENT_ID` | yes | OAuth client ID. |
| `GOOGLE_CLIENT_SECRET` | yes | OAuth client secret. |
| `GOOGLE_REDIRECT_URI` | yes | `<backend origin>/auth/google/callback`. Must also be registered in Google Cloud Console. |
| `GEMINI_API_KEY` | yes | Gemini API key. The backend won't start without it. |
| `GEMINI_MODELS` | no | Comma-separated list of models to try in order. Default `gemini-2.5-flash,gemini-2.5-flash-lite`. |
| `DATABASE_URL` | yes | Neon **pooled** connection string, used by the app. |
| `DIRECT_URL` | yes | Same URL without `-pooler`, used by migrations. |
| `JWT_SECRET` | yes | Signs session tokens. |
| `TOKEN_ENCRYPTION_KEY` | yes | 32-byte base64 key that encrypts stored Google tokens. |

Generate the two secrets with:

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"  # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"     # TOKEN_ENCRYPTION_KEY
```

> Changing `TOKEN_ENCRYPTION_KEY` makes stored Google tokens unreadable, so every user has to sign in again. Changing `JWT_SECRET` logs everyone out.

### Frontend (`apps/frontend`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | yes | Backend origin, for example `http://localhost:3000`. |

`VITE_*` values are baked in at build time, so rebuild the frontend after changing one.

### Environment files

| | Backend | Frontend |
|---|---|---|
| Local | `.env.development` (used by `pnpm dev`) | `.env.development` (used by `vite`) |
| Prod | `.env.production` (used by `pnpm start:prod`) | `.env.production` (used by `vite build`) |

How the apps point at each other:

- Frontend `VITE_API_URL` → backend origin
- Backend `FRONTEND_URL` → frontend origin
- Backend `GOOGLE_REDIRECT_URI` → `<backend origin>/auth/google/callback`

## Scripts

Run these from the repository root:

| Command | What it does |
|---|---|
| `pnpm dev` | Starts the backend (watch mode) and frontend (Vite) together |
| `pnpm dev:backend` / `pnpm dev:frontend` | Starts one app |
| `pnpm build` | Builds both apps (`build:backend` / `build:frontend` build one) |
| `pnpm start:prod` | Runs the built backend with `NODE_ENV=production` |
| `pnpm lint` | Lints every app (ESLint for the backend, `tsc` type check for the frontend) |
| `pnpm test` | Runs every app's tests |
| `pnpm db:migrate` | Creates or applies migrations against the dev database |
| `pnpm db:deploy:prod` | Applies committed migrations to the prod database |

Backend-only scripts (`pnpm --filter backend <script>`): `test:watch`, `test:cov`, `test:e2e`, `format`, `start:debug`, `db:studio`.

## Database

The database is Postgres on Neon, accessed with Prisma. The schema is in [apps/backend/prisma/schema.prisma](apps/backend/prisma/schema.prisma).

| Table | Purpose |
|---|---|
| `users` | Google account ID, email, and name, plus the encrypted Google refresh token, access token, and access-token expiry |
| `pending_approvals` | Actions the agent has proposed but the user hasn't approved yet: action, arguments, message, expiry. Deleted along with their user. |

- The app connects through `DATABASE_URL` (pooled). Migrations use `DIRECT_URL` (direct). See [apps/backend/prisma.config.ts](apps/backend/prisma.config.ts).
- To change the schema, edit `schema.prisma` and run `pnpm db:migrate`. Commit the generated folder under `prisma/migrations/`.
- Use a separate Neon branch for production.
- `pnpm --filter backend db:studio` opens Prisma Studio against the dev database.

## Authentication

1. The frontend sends the browser to `GET /auth/google`, which redirects to Google's consent screen. The app requests the `openid`, `email`, `profile`, `gmail.modify`, and `gmail.send` scopes with offline access.
2. Google redirects to `GET /auth/google/callback`. The backend exchanges the code, then creates or updates the user and stores the Google tokens encrypted with AES-256-GCM.
3. The backend redirects to `<FRONTEND_URL>/auth/callback#token=<jwt>`. The token is in the URL fragment so it never reaches the frontend host's server logs. On failure, the fragment holds `#error=...` instead.
4. The frontend stores the 7-day session JWT and sends it as `Authorization: Bearer <token>`.
5. `SessionGuard` protects the Gmail, AI, and agent routes. It checks the JWT, loads the user, and refreshes the Google access token about a minute before it expires. Pending approvals belong to the user who created them.

## The agent

`POST /agent` runs a tool-calling loop with Gemini. Each message can take up to 8 tool rounds, for example search → read → act → answer. The client sends up to the last 20 conversation turns as `history` so follow-ups like "delete it" work. It can also send an IANA `timeZone` so that "today" and "this week" resolve correctly.

**Read tools** run straight away:

| Tool | Description |
|---|---|
| `search_emails` | Gmail query → up to 25 short summaries |
| `count_emails` | Exact count of matches, up to 5000 |
| `read_email` | One full message (body cut at 6000 characters) |
| `read_thread` | The last 10 messages of a thread |
| `list_labels` | The user's labels |

**Approval tools** only create a pending approval:

| Tool | Description |
|---|---|
| `modify_emails` | Applies an operation to specific message IDs (up to 100) or to every match of a query (up to 5000, or 500 for `restore`) |
| `send_email` | Sends a new email (up to 50 recipients). Optionally sends each recipient their own copy. |
| `reply_to_email` | Replies in the existing thread, optionally to everyone |

Supported operations: `trash`, `restore`, `archive`, `move_to_inbox`, `mark_read`, `mark_unread`, `star`, `unstar`, `mark_important`, `mark_not_important`, `add_label`, `remove_label`, `mark_spam`.

The backend works out what an approval will do when the agent proposes it: the exact recipients and body, or the matched message count plus a 5-email preview. The frontend shows that in an approval card. The user then calls `POST /agent/approve` or `POST /agent/reject`. Approvals expire after **1 hour**.

When a Gemini model hits its quota, the agent remembers when that quota resets and moves to the next model in `GEMINI_MODELS`.

## API reference

The full interactive docs are at **`/api`** (Swagger). Every route except the first two under `/auth` needs `Authorization: Bearer <session token>`.

### Auth

| Method | Path | Description |
|---|---|---|
| GET | `/auth/google` | Start Google sign-in |
| GET | `/auth/google/callback` | OAuth callback. Redirects to the frontend. |
| GET | `/auth/me` | Current user (`id`, `email`, `name`) |

### Gmail

| Method | Path | Description |
|---|---|---|
| GET | `/gmail/emails?query=&maxResults=&pageToken=` | List emails (paginated) |
| GET | `/gmail/emails/:id` | Get one email |
| GET | `/gmail/search?q=&maxResults=` | Search emails |
| GET | `/gmail/threads/:id` | Get a thread |
| PATCH | `/gmail/emails/:id/read` · `/unread` | Mark read or unread |
| PATCH | `/gmail/emails/:id/star` · `/unstar` | Star or unstar |
| PATCH | `/gmail/emails/:id/important` · `/not-important` | Set or clear important |
| POST | `/gmail/emails/:id/archive` | Archive |
| POST | `/gmail/emails/:id/trash` · `/restore` | Move to trash or restore |
| GET | `/gmail/labels` | List labels |
| POST / DELETE | `/gmail/emails/:id/labels/:labelId` | Add or remove a label |
| GET | `/gmail/drafts` | List drafts |
| POST | `/gmail/send` | Send an email (`to`, `cc`, `subject`, `textBody`, `sendSeparately`, `replyToMessageId`) |
| POST | `/gmail/emails/batch` | Apply one operation to up to 1000 message IDs (`messageIds`, `operation`, `labelId`) |
| DELETE | `/gmail/emails/bulk` | Move several messages to trash (`messageIds`) |

### AI and agent

| Method | Path | Description |
|---|---|---|
| POST | `/ai/analyze-email` | Analyse an email (`from`, `to`, `subject`, `body`). Returns summary, category, priority, sentiment, action items, deadlines. |
| POST | `/agent` | Send the agent a message (`message`, `history`, `timeZone`). Returns `response`, `toolCalls`, `approvals`. |
| POST | `/agent/approve` | Run a pending approval (`approvalId`) |
| POST | `/agent/reject` | Discard a pending approval (`approvalId`) |

When Gmail rate-limits a request, the API returns **429** with a message asking the user to try again shortly. Gmail calls are limited to 4 at a time per user.

## Testing and linting

```sh
pnpm test                          # unit tests (Jest, *.spec.ts in apps/backend/src)
pnpm --filter backend test:cov     # with coverage
pnpm --filter backend test:e2e     # e2e tests (apps/backend/test)
pnpm lint                          # ESLint (backend) + tsc type check (frontend)
```

## Deploying to production

1. Create a production database (a separate Neon branch works). Put its URLs in `apps/backend/.env.production`, along with production values for every other backend variable.
2. Add the production callback URL (`https://<api-domain>/auth/google/callback`) to the OAuth client in Google Cloud Console. To let people other than test users sign in, publish the consent screen. The Gmail scopes are restricted, so Google has to verify the app first.
3. Set `VITE_API_URL` in `apps/frontend/.env.production` to the production API origin.
4. Build and migrate:

   ```sh
   pnpm install
   pnpm build
   pnpm db:deploy:prod
   pnpm start:prod
   ```

5. Serve `apps/frontend/dist` as static files. The host must serve `index.html` for unknown paths (SPA fallback) so that `/auth/callback` works.
6. Make sure the backend's `FRONTEND_URL` exactly matches the frontend's origin, or CORS will block requests.

### Backend on Render

[render.yaml](render.yaml) is a Render Blueprint for the backend. In Render, choose **New → Blueprint**, pick this repo, and fill in the secret environment variables when asked. Render then installs, builds, applies migrations, and starts the API. Health checks use `/api`.

- Don't set `NODE_ENV` on Render. The build needs devDependencies, and `start:prod` sets `NODE_ENV` itself.
- Render provides `PORT` automatically.
- Set `GOOGLE_REDIRECT_URI` to `https://<service>.onrender.com/auth/google/callback` and register that URI in Google Cloud Console.
- Free instances go to sleep when idle, so the first request after a while can take up to about a minute.

## Troubleshooting

| Problem | Fix |
|---|---|
| `GEMINI_API_KEY is not configured` at startup | The env file wasn't found or is missing the key. Check `NODE_ENV` and that `.env.development` exists in `apps/backend`. |
| `redirect_uri_mismatch` from Google | `GOOGLE_REDIRECT_URI` must exactly match a redirect URI registered on the OAuth client. |
| `access_denied` after the consent screen | The app is in testing mode and your account isn't a test user. |
| Browser shows CORS errors | `FRONTEND_URL` (backend) and `VITE_API_URL` (frontend) don't match the real origins. Rebuild the frontend after changing `VITE_API_URL`. |
| Every request returns 401 after rotating keys | The session or stored tokens are no longer valid. Sign out and sign in again. |
| Agent says the quota is used up | The Gemini free tier has low per-model daily limits. Add more models to `GEMINI_MODELS` or use a paid key. |
| Migrations hang or fail on Neon | Migrations need the direct URL. Check that `DIRECT_URL` doesn't contain `-pooler`. |
| 404 on `/auth/callback` in production | Turn on the SPA fallback on the frontend host. |
