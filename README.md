# LifeDrop – Blood Donation Management Platform

LifeDrop connects voluntary blood donors with verified blood requirements. Donors register, upload donation
certificates, earn **100 points per verified donation** and appear on a leaderboard; administrators verify
certificates, publish requirements (which e-mail matching, opted-in donors), and monitor everything from a
dashboard with analytics, e-mail logs, reminders, audit logs and an AI assistant.

> **Medical safety.** LifeDrop never decides medical eligibility or blood compatibility. Blood group is used only to
> choose *who is notified*; the three-month follow-up e-mail is a reminder to *ask medical staff*. Hospital/blood-bank
> staff always decide.

## Contents
1. [Features](#features) · 2. [Tech stack](#technology-stack) · 3. [Folder structure](#folder-structure)
4. [Prerequisites](#prerequisites) · 5. [Quick start (Docker)](#quick-start-docker) · 6. [Environment](#environment-configuration)
7. [Local development](#local-development-without-docker) · 8. [MongoDB](#mongodb) · 9. [Brevo](#brevo-setup) · 10. [Backblaze B2](#backblaze-b2-setup) · 11. [Groq](#groq-setup)
12. [API docs](#api-documentation) · 13. [Testing](#testing) · 14. [Production](#production-deployment) · 15. [Security](#security-notes) · 16. [Troubleshooting](#troubleshooting)

## Features
**Public site** – Home, About, How it works, Blood requirements, Leaderboard, Contact, FAQ, Privacy, Terms, Login, Register (SEO titles/descriptions, FAQ JSON-LD, responsive).

**Donors** – registration with consent, e-mail verification, forgot/reset/change password, dashboard (verified donations, points, rank, next follow-up reminder), donation history, certificate upload (drag & drop, validation), points ledger, active requirements, notification centre, profile, availability toggle, privacy controls (hide from leaderboard, e-mail preferences), data export, account-deletion request, help chatbot.

**Admins** – dashboard stats and charts, donor management (search, blood-group/location/status filters, activate/deactivate, details & history), donation records (correct/invalidate), certificate review queue with inline preview and approve/reject (with reason), requirement management (create/edit/publish/close/delete + per-donor delivery status), leaderboard, e-mail logs with retry, reminder management (reschedule/cancel), analytics with date filters + CSV export, AI assistant (Groq), administrator management (super admin), audit logs, settings.

**Platform** – JWT access tokens + rotating refresh tokens (re-use detection), RBAC enforced on every API route, BullMQ/Redis persistent queues for e-mails and reminders with a self-healing maintenance sweep, Brevo transactional e-mail with delivery webhook, Backblaze B2 private storage with short-lived signed URLs, Swagger docs.

### Business rules (enforced server-side and covered by tests)
* Points: exactly **100** per *approved* certificate; none on upload, pending or rejected. The unique index `(donation, type)` on `PointsTransaction` plus the atomic `PENDING → APPROVED` transition make awards idempotent even with concurrent approvals. Invalidating a verified donation writes a single reversing transaction.
* Duplicates: one live donation per donor per day; the same certificate file (SHA-256) cannot be submitted twice.
* Requirement e-mails: only to active, verified, available donors who opted in; one e-mail per `(requirement, donor)` (unique index); re-checked at send time; every e-mail contains blood group, hospital, full address, units, contact details, description and deadline.
* Reminders: one per donation, scheduled N (default 3) **calendar** months after the donation day at 09:00 in `APP_TIMEZONE`; persisted in MongoDB *and* queued in Redis; rescheduled when the donation date is corrected, cancelled when the donation is invalidated; admins can reschedule/cancel.

## Technology stack
| Layer | Tech |
|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS 3, shadcn-style components (Radix UI + CVA), React Router, Axios, React Hook Form + Zod, Recharts, Lucide, Sonner |
| Backend | Node.js 22, Express 4, TypeScript, Mongoose (MongoDB 7), Zod, JWT, bcrypt, Multer, Helmet, express-rate-limit, Pino, Swagger UI |
| Integrations | Brevo REST API, Backblaze B2 (S3 API via AWS SDK v3), Groq (OpenAI-compatible API), BullMQ on Redis |
| DevOps | Docker, Docker Compose, nginx (unprivileged), health checks, named volumes |
| Tests | Vitest, Supertest, mongodb-memory-server, Testing Library |

## Folder structure
```
LIFEDROP/
├─ docker-compose.yml          production-style stack (nginx, API, MongoDB, Redis)
├─ docker-compose.dev.yml      hot-reload development stack
├─ .env.example                all variables with placeholders
├─ scripts/generate-env.js     creates .env with random secrets
├─ server/                     Express + TypeScript API
│  ├─ Dockerfile  .dockerignore  .env.example
│  ├─ src/
│  │  ├─ config/env.ts         validated configuration
│  │  ├─ models/               13 Mongoose models
│  │  ├─ middleware/           auth/RBAC, validation, NoSQL sanitising, rate limits, uploads, errors
│  │  ├─ modules/              route modules (auth, donors, donations, certificates, requirements, points, admin, misc)
│  │  ├─ services/             business logic: donation workflow, points, requirements, reminders, e-mail+templates, storage, AI, queue, analytics
│  │  ├─ docs/openapi.ts       OpenAPI spec (served at /api/docs)
│  │  ├─ workers.ts            BullMQ workers + maintenance sweep
│  │  └─ app.ts  server.ts
│  └─ tests/                   83 API/integration tests
└─ client/                     React SPA
   ├─ Dockerfile  nginx/       multi-stage build → nginx with SPA fallback + /api proxy
   └─ src/ (components, pages/{public,donor,admin}, lib, store, test)
```

## Prerequisites
* Docker Desktop / Docker Engine with Compose v2 **or** Node.js 22+, a MongoDB 7 instance and Redis 7 for non-Docker runs.
* Accounts (free tiers are enough): [Brevo](https://www.brevo.com), [Backblaze B2](https://www.backblaze.com/cloud-storage), [Groq](https://console.groq.com). The app starts without them; the related features report "not configured" (see each section).

## Quick start (Docker)
```bash
# 1. create .env with fresh random secrets (prints the initial super-admin password)
node scripts/generate-env.js
# 2. edit .env: SEED_SUPER_ADMIN_EMAIL, BREVO_*, B2_*, GROQ_*  (optional for a first look)
# 3. build and start everything
docker compose up -d --build
```
| Service | URL |
|---|---|
| Web app | http://localhost:5173 |
| API | http://localhost:5000/api/v1 (health: `/api/v1/health`) |
| Swagger UI | http://localhost:5000/api/docs |

Log in at `/login` with `SEED_SUPER_ADMIN_EMAIL` and the generated password, then change it.

```bash
docker compose ps                 # status + health
docker compose logs -f backend    # follow API logs
docker compose stop               # stop (keeps data)
docker compose down               # remove containers (keeps volumes)
docker compose down -v            # ⚠ also deletes MongoDB + Redis data
docker compose up -d --build      # rebuild after code changes
```
**Development stack with hot reload** (Vite + `tsx watch`, MongoDB/Redis ports exposed on localhost):
```bash
docker compose -f docker-compose.dev.yml up --build
docker compose -f docker-compose.dev.yml down
```
Without Brevo configured, outside production the API **logs each e-mail** (including verification links) instead of sending it, so you can register and verify locally. In `NODE_ENV=production` unconfigured e-mail fails loudly.

## Environment configuration
`.env.example` documents every variable. Highlights:

| Variable | Notes |
|---|---|
| `NODE_ENV` | `development` (default) or `production` (compose passes it through; use `production` when deploying) |
| `CLIENT_URL` | Browser origin(s), comma separated – used for CORS allow-list and e-mail links |
| `API_BASE_URL` | Public API URL – used for one-click unsubscribe links |
| `MONGO_ROOT_USERNAME/PASSWORD` | Compose builds the authenticated `MONGODB_URI` from these at runtime (never as build args) |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | ≥32 chars, different from each other; the API refuses placeholders in production |
| `COOKIE_SECURE` | `true` once served over HTTPS |
| `SEED_SUPER_ADMIN_EMAIL/PASSWORD` | Creates the first SUPER_ADMIN if none exists |
| `BREVO_*`, `B2_*`, `GROQ_*` | See below |
| `QUEUE_REDIS_URL` | `redis://redis:6379` in Docker |
| `APP_TIMEZONE` | IANA zone used for reminder scheduling and monthly reports (default `Asia/Kolkata`) |
| `VITE_API_BASE_URL` | Only public, non-secret values may use the `VITE_` prefix |

Generate **different** secrets for local and production: `node scripts/generate-env.js --production`.
`.env` files are git-ignored; never commit them.

## Local development without Docker
```bash
# MongoDB and Redis must be running (e.g. docker run -p 27017:27017 mongo:7 / docker run -p 6379:6379 redis:7)
cd server && cp .env.example .env && npm ci && npm run dev      # http://localhost:5000
cd client && npm ci && npm run dev                               # http://localhost:5173 (proxies /api)
```
Edit `server/.env` first (secrets, `MONGODB_URI`, seed admin). From the repo root: `npm run test`, `npm run typecheck`.

## MongoDB
Compose runs `mongo:7` with `--auth`, a named volume (`mongo_data`), a health check and **no published port** (internal network only). The API creates indexes on start (`syncIndexes`). Connect for debugging with
`docker compose exec mongodb mongosh -u "$MONGO_ROOT_USERNAME" -p --authenticationDatabase admin`.
Back up: `docker compose exec mongodb mongodump -u … -p … --authenticationDatabase admin --archive > backup.archive`.
> Transactions are not required: idempotency is achieved with atomic conditional updates and unique indexes, so a standalone MongoDB is enough.

## Brevo setup
1. Create an account, verify a **sender** (`BREVO_SENDER_EMAIL`) and, for good deliverability, authenticate your domain (SPF/DKIM).
2. *SMTP & API → API keys* → create a key → `BREVO_API_KEY`.
3. *Transactional → Settings → Webhook*: URL `https://YOUR_API_HOST/api/v1/webhooks/brevo`, events *delivered, hard bounce, soft bounce, blocked, invalid, spam, unsubscribed*; add header `Authorization: Bearer <BREVO_WEBHOOK_SECRET>`. Statuses move `QUEUED → SENT → DELIVERED/BOUNCED` and are mirrored on each requirement recipient.
4. The webhook must be reachable from the internet (use a tunnel such as ngrok for local testing).

Delivery is queued in Redis with 5 attempts and exponential back-off; 4xx errors from Brevo (except 408/429) are treated as permanent. Retry from *Admin → Email logs*.

## Backblaze B2 setup
1. Create a **private** bucket (do *not* make it public).
2. *App Keys* → create a key restricted to that bucket with read/write/delete → `B2_KEY_ID`, `B2_APPLICATION_KEY`.
3. Use the bucket's **S3 endpoint** (e.g. `https://s3.us-west-004.backblazeb2.com`) as `B2_ENDPOINT`, its region (`us-west-004`) as `B2_REGION`, and the bucket name as `B2_BUCKET_NAME`.
4. For the in-browser certificate preview add a CORS rule allowing `GET` from your `CLIENT_URL` (images/PDF in iframes also work via the signed URL; “Open in new tab” always works).
Objects get random 192-bit names; downloads use 5-minute signed URLs; credentials never reach the browser.

## Groq setup
Create a key at console.groq.com → `GROQ_API_KEY` (several keys may be comma-separated; they are rotated automatically when one is rate-limited), and set `GROQ_MODEL` to a model id listed in your Groq console — `openai/gpt-oss-20b` works well on the free tier. Requests are made **only by the API**, are rate-limited (15/min/user), validated (length/role limits) and receive **anonymised aggregates only** (no names, e-mails or phones). The AI cannot approve certificates or judge medical eligibility, and its system prompts forbid it.

## API documentation
Interactive docs: **`/api/docs`** (spec at `/api/docs.json`). All routes live under `/api/v1`; responses use `{ success, data, meta? }` or `{ success:false, error:{ code, message, details? } }`. Authenticate with `Authorization: Bearer <accessToken>`; the refresh token is an httpOnly cookie rotated on `/auth/refresh`.

Beyond the required routes the API adds `/auth/change-password`, `/auth/resend-verification`, `/donors/my-data`, `/donors/deletion-request`, `/donors/profile/picture`, `/admin/email-logs`, `/admin/reminders`, `/notifications/unsubscribe`, `/public/stats`, `/public/contact`. Donations are created by uploading a certificate (`POST /certificates/upload`) so every donation is backed by a file.

## Testing
```bash
cd server && npm test      # 83 tests: auth, RBAC, registration, uploads, approval, duplicate-reward prevention,
                           #   requirement targeting, Brevo (mocked fetch), reminders, B2 (mocked SDK), Groq (mocked), leaderboard
cd client && npm test      # 54 tests: forms, route guards, upload & review workflows, tables, dialogs, every page renders
```
Server tests use `mongodb-memory-server` (downloads a MongoDB binary on first run) and mock Redis/queue, B2, Brevo and Groq – no external services needed.

## Production deployment
1. `node scripts/generate-env.js --production`, then fill in real values; set `CLIENT_URL` and `API_BASE_URL` to your public HTTPS URLs and `COOKIE_SECURE=true`.
2. Put a TLS-terminating reverse proxy/load balancer (Caddy, Traefik, cloud LB) in front of the `frontend` container; it already proxies `/api` to the backend, sets security headers and a strict CSP, and serves the SPA with history fallback. Keep `TRUST_PROXY` equal to the number of proxies in front of the API.
3. `docker compose up -d --build`. MongoDB and Redis are unreachable from outside; the API port is bound to `127.0.0.1` (change `API_PORT`/remove the mapping if not needed).
4. Back up the `mongo_data` volume regularly (`redis_data` only holds queue state, which MongoDB can rebuild).
5. Register the Brevo webhook, change the seeded super-admin password, and review *Admin → Settings* for integration status.
Scale-out: the API is stateless; run extra replicas with `RUN_WORKERS=true` on one (or all – BullMQ de-duplicates jobs).

## Security notes
Helmet, strict CORS allow-list, global + route-specific rate limits, Zod validation on every input, NoSQL-operator stripping, bcrypt (cost 12), 15-minute access tokens, rotating refresh tokens with family revocation on re-use, role re-read from the database on each request, private storage with random keys and signed URLs, magic-byte file validation, audit log for admin actions, no secrets in images/build args/frontend, request logs without bodies/headers, CSV formula-injection guard, non-root containers. Responses never contain password hashes, storage keys or API keys.

## Troubleshooting
| Symptom | Fix |
|---|---|
| API exits with “Invalid environment configuration” | Set `JWT_*` to ≥32-char random values (`node scripts/generate-env.js`) |
| Can't log in over `http://` on Safari | Keep `COOKIE_SECURE=false` locally; use HTTPS in production |
| Verification / reset e-mails never arrive | Configure Brevo; in development check `docker compose logs backend` for the logged link; see *Admin → Email logs* |
| “File storage (Backblaze B2) is not configured” | Fill all five `B2_*` values and restart the backend |
| Certificate preview blank | Add a B2 CORS rule for your origin or use “Open in new tab” |
| Reminders / e-mails stuck in QUEUED | Check `docker compose ps` (Redis healthy?) – the sweep re-queues stale items every 15 minutes, or press *Retry* |
| `docker compose up` fails on `MONGO_ROOT_PASSWORD` | `.env` is missing – run the generate script |
| Port already in use | Change `FRONTEND_PORT` / `API_PORT` in `.env` (and `CLIENT_URL`/`API_BASE_URL` accordingly) |
| Reset everything | `docker compose down -v` (deletes data) |
#   L i f e D r o p 
 
 