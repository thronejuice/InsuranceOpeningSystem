# Insurance Opening System V1

ระบบบริหารงานประกันภัยสำหรับ Broker/Agent — ครอบคลุมตั้งแต่ Customer → Job → Quotation → Proposal → Approval → Binding → Policy → Payment → Commission → Renewal

## Stack

| Layer | Technology |
|---|---|
| API | NestJS 12 · Prisma 6 · PostgreSQL 16 · Redis 7 (BullMQ) |
| Frontend | Angular 22 · Angular Material 22 · Signals |
| Storage | Local (dev) · MinIO/S3-compatible (prod) |
| Auth | JWT (access + refresh cookie) · RBAC |

---

## Quick Start — Development

### Prerequisites

- Node.js 22
- Docker Desktop (for Postgres + Redis + Mailpit)

```bash
# 1. Clone and install
git clone <repo-url>
cd InsuranceOpening_System
cp .env.example .env          # fill in JWT_ACCESS_SECRET (min 32 chars)
npm install

# 2. Start infrastructure
docker compose up -d

# 3. Run migrations + seed
npm run db:migrate
npm run db:seed               # creates roles, permissions, and sample users

# 4. Start dev servers
npm run dev                   # api :3000  web :4200
```

Open http://localhost:4200 and log in as `admin` / `Password@123` (or the value of `SEED_USER_PASSWORD` in your `.env`).

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | ✅ | — | Random string ≥ 32 chars — `openssl rand -base64 48` |
| `SEED_USER_PASSWORD` | — | `Password@123` | Password for all seeded demo users |
| `REDIS_HOST` / `REDIS_PORT` | — | `localhost` / `6379` | Redis connection |
| `CORS_ORIGINS` | — | `http://localhost:4200` | Comma-separated allowed origins |
| `STORAGE_DRIVER` | — | `local` | `local` or `s3` |
| `S3_ENDPOINT` | if s3 | — | MinIO/S3 endpoint URL |
| `S3_BUCKET` | if s3 | — | Bucket name |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | if s3 | — | S3 credentials |

---

## Commands

```bash
# Development
npm run dev            # start API + web concurrently
npm run dev:api        # API only
npm run dev:web        # web only

# Database
npm run db:migrate     # apply migrations (dev)
npm run db:seed        # seed roles, permissions, sample users + master data
npm run db:reset       # drop + recreate + seed (DESTRUCTIVE)

# Tests
npm run test           # unit tests (vitest)
npm run test:e2e       # API integration tests (needs running Postgres)
npm run e2e            # Playwright UI tests (needs `npm run dev` running)

# Build
npm run build          # compile API + Angular

# Generate frontend types from OpenAPI
npm run gen:api        # needs API running at :3000
```

---

## Production Deployment

### First-time setup

1. Create a `.env.prod` with all required variables (use strong `POSTGRES_PASSWORD` and `JWT_ACCESS_SECRET`):

```env
POSTGRES_PASSWORD=<strong-password>
JWT_ACCESS_SECRET=<openssl rand -base64 48>
SEED_USER_PASSWORD=<initial-admin-password>
CORS_ORIGINS=https://your-domain.com
S3_ACCESS_KEY=<minio-user>
S3_SECRET_KEY=<minio-password>
S3_BUCKET=insurance-uploads
```

2. Run migrations + seed (one-time):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm migrate
```

3. Start all services:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

The app is served at `http://localhost` (port 80 by default; set `WEB_PORT=443` for HTTPS behind a reverse proxy).

### Services

| Service | Port | Description |
|---|---|---|
| `web` | 80 (configurable) | nginx serving Angular + proxying /api |
| `api` | internal | NestJS API |
| `postgres` | internal | PostgreSQL database |
| `redis` | internal | Redis for job queues |
| `minio` | 9001 (console) | S3-compatible file storage |

### Subsequent deployments

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

---

## Demo Users (after `db:seed`)

| Username | Role | Key Permissions |
|---|---|---|
| `admin` | ADMIN | All permissions |
| `agent` | AGENT | Own jobs only |
| `agent01` | AGENT | Own jobs only |
| `staff` | BROKER_STAFF | All jobs (view + manage) |
| `supervisor` | SUPERVISOR | All jobs + approval |
| `manager` | MANAGER | All jobs + approval |
| `finance` | FINANCE | Payment + commission |
| `viewer` | VIEWER | Read-only access |

Password for all demo users: value of `SEED_USER_PASSWORD` (default `Password@123`).

---

## Acceptance Flow (spec §47)

Complete flow through the system:

1. Login → 2. Create Customer → 3. Create Job → 4–6. Insurance Type / Product / Risk →
7. Coverage → 8. Documents → 9. Submit Job → 10. Request Quotation →
11–13. Add companies + record quotations → 14. Compare → 15. Select Quotation →
16. Create Proposal → 17. Send → 18. Customer Accept → 19. Approval →
20. Binding → 21. Issue Policy → 22. Record Payment → 23. Commission →
24. Schedule Renewal → 25. Activity Timeline

---

## Project Structure

```
apps/
  api/         NestJS API (modules/, common/, prisma/)
  web/         Angular 22 SPA (features/, core/, shared/)
docs/
  PLAN.md      Daily task log
  DESIGN.md    Technical decisions & conventions
docker-compose.yml         Local dev infrastructure
docker-compose.prod.yml    Production deployment
```
