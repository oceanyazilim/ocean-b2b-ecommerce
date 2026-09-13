# Ocean Commerce

Multi-tenant B2B / wholesale / DTC commerce SaaS platform. One codebase, many independent merchant stores.

Architecture docs live in [`docs/architecture`](./docs/architecture/00-overview.md). Read `00-overview.md` first.

## Repository layout

```
apps/
  marketing/        Public SaaS website             http://localhost:3000
  admin/            Merchant admin                  http://localhost:3001
  storefront/       Merchant storefront + B2B portal http://localhost:3002
  platform-admin/   Internal platform operations    http://localhost:3003
  api/              NestJS modular monolith         http://localhost:4000
packages/
  config/           Shared tsconfig / ESLint / Tailwind presets
  db/               Prisma schema, migrations, PrismaClient
  types/            Shared zod schemas and API contracts
  permissions/      RBAC vocabulary + evaluation engine
  ui/               Design system primitives
  utils/            Framework-agnostic helpers
docs/architecture/  Architecture decisions and phase roadmap
```

## Prerequisites

- Node.js 22+
- pnpm 10 (`npm i -g pnpm@10`)
- Docker Desktop (Postgres, Redis, MinIO, Meilisearch run in containers)

## First run

```bash
cp .env.example .env
pnpm install
pnpm infra:up          # docker compose up -d
pnpm db:migrate        # prisma migrate dev
pnpm dev               # all apps via Turborepo
```

Or run a single app: `pnpm --filter @ocean/api dev`.

### Without Docker (native Windows)

Install PostgreSQL 16 and Memurai (Redis-compatible) natively, then run a user-owned cluster —
no service or admin rights needed:

```powershell
$pg = "C:\Program Files\PostgreSQL\16\bin"; $data = "$env:USERPROFILE\ocean-pgdata"
& "$pg\initdb.exe" -D $data -U ocean --pwfile=<(echo ocean) -E UTF8   # first time only
Start-Process "$pg\pg_ctl.exe" -ArgumentList "-D `"$data`" -l `"$data\server.log`" start" -WindowStyle Hidden
& "$pg\psql.exe" -h localhost -U ocean -d postgres -c "CREATE DATABASE ocean_dev"   # first time only
```

Memurai installs as a Windows service on port 6379. `.env` defaults already match both.

### Integration tests

`pnpm test` runs unit tests only. `pnpm test:integration` additionally runs the API suite against
`DATABASE_URL` / `REDIS_URL` (opt-in via `OCEAN_INTEGRATION=1`; CI sets it).

## Everyday commands

| Command           | What it does                         |
| ----------------- | ------------------------------------ |
| `pnpm dev`        | Start every app in watch mode        |
| `pnpm build`      | Build all packages and apps          |
| `pnpm lint`       | ESLint across the monorepo           |
| `pnpm typecheck`  | `tsc --noEmit` across the monorepo   |
| `pnpm test`       | Vitest across the monorepo           |
| `pnpm format`     | Prettier write                       |
| `pnpm db:studio`  | Prisma Studio against `DATABASE_URL` |
| `pnpm infra:down` | Stop local infrastructure containers |

## Development method

Work lands module by module (see `docs/architecture/13-phases-and-testing.md`). Each module is
planned (goal, data model, API, service layer, UI, validation, permissions, tests) before it is
implemented, and verified (typecheck, lint, tests, migrations, tenant isolation) after.
