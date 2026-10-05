# MailPilot

pnpm monorepo:

- `apps/backend` — NestJS API (Gmail + Gemini agent), port 3000
- `apps/frontend` — React + TypeScript (Vite), port 5173

## Setup

```sh
pnpm install
cp apps/backend/.env.example apps/backend/.env.development   # fill in secrets
cp apps/frontend/.env.example apps/frontend/.env.development
pnpm db:migrate                                               # apply DB migrations (dev)
pnpm dev                                                      # runs both apps
```

## Database

Postgres on [Neon](https://neon.tech), accessed with Prisma (`apps/backend/prisma/schema.prisma`).

- `DATABASE_URL` is Neon's pooled URL (used by the app); `DIRECT_URL` is the same URL without `-pooler` (used by migrations).
- `pnpm db:migrate` creates/applies migrations against the dev database; `pnpm db:deploy:prod` applies committed migrations to prod.
- Use a separate Neon branch for prod.

## Auth

Sign-in is Google OAuth. On callback the backend stores the user (Google refresh/access tokens encrypted with `TOKEN_ENCRYPTION_KEY`) and redirects to the frontend with a 7-day session JWT signed with `JWT_SECRET`. `SessionGuard` protects the Gmail, AI and agent routes, refreshes the Google access token when it expires, and scopes pending approvals to their owner.

## Environments

| | Backend (`apps/backend`) | Frontend (`apps/frontend`) |
|---|---|---|
| Local | `.env.development` (used by `pnpm dev`) | `.env.development` (used by `vite`) |
| Prod | `.env.production` (used by `pnpm start:prod`) | `.env.production` (used by `vite build`) |

How the apps connect:

- Frontend `VITE_API_URL` → backend origin.
- Backend `FRONTEND_URL` → frontend origin (CORS allow-list and the redirect target after Google login).
- Backend `GOOGLE_REDIRECT_URI` → `<backend origin>/auth/google/callback`, also registered in Google Cloud Console.

All `.env*` files are gitignored; only each app's `.env.example` is committed. Copy it to `.env.development` / `.env.production` and fill it in. `VITE_*` values are baked in at build time, so the frontend must be rebuilt when they change.

The frontend host must serve `index.html` for unknown paths (SPA fallback) so `/auth/callback` resolves in production.
