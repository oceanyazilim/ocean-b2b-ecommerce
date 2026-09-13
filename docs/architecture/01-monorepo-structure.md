# 01 — Monorepo Structure

Tooling: **pnpm workspaces + Turborepo**, TypeScript `strict` everywhere, ESLint 9 flat config,
Prettier. Node 22+.

```
ocean-b2b-eticaret-software/
├── apps/
│   ├── marketing/          Next.js 15 (App Router)   port 3000
│   ├── admin/              Next.js 15                port 3001
│   ├── storefront/         Next.js 15                port 3002
│   ├── platform-admin/     Next.js 15                port 3003
│   └── api/                NestJS 11 modular monolith port 4000
├── packages/
│   ├── config/             tsconfig presets, ESLint presets, Tailwind preset
│   ├── db/                 Prisma schema + migrations + PrismaClient singleton
│   ├── types/              zod schemas + API contract types shared by API and UIs
│   ├── permissions/        Permission vocabulary, built-in roles, evaluation engine
│   ├── ui/                 Design system primitives (React 19 + Tailwind)
│   └── utils/              Framework-agnostic helpers
├── docs/architecture/      This document set
├── docker-compose.yml      postgres, redis, minio, meilisearch
├── turbo.json              Task graph (build → lint/typecheck/test depend on ^build)
└── .github/workflows/ci.yml
```

Planned additions (not yet created; add when their phase starts):

```
packages/theme-engine/      Runtime: registry, renderer, schema validation   (Phase 9)
packages/theme-editor/      Editor state, command/undo model, preview bridge  (Phase 10)
themes/foundation/          First theme package                               (Phase 9)
themes/wholesale-pro/       Second theme package                              (Phase 9)
apps/worker/                BullMQ worker process (split from api when needed) (Phase 7+)
packages/sdk/               Typed client for Admin/Storefront APIs            (Phase 8)
```

## Package conventions

- **Naming:** every workspace package is `@ocean/<name>`.
- **Build output:** shared packages compile with `tsc` to `dist/` as CommonJS (`module: NodeNext`,
  no `"type": "module"`). This is consumed identically by Nest (Node/CJS) and Next (bundler).
  `@ocean/ui` is additionally listed in each Next app's `transpilePackages`.
- **Exports:** `main`/`types` point at `dist/`. CSS is exported from `src` (`@ocean/ui/styles.css`).
- **Tests:** Vitest, colocated `*.test.ts`, excluded from the build tsconfig.
- **tsconfig:** extend one of `@ocean/config/tsconfig/{library,react-library,nextjs,nest}.json`.
  Never redefine strictness flags per package.
- **ESLint:** `eslint.config.mjs` importing `@ocean/config/eslint/{base,next,nest}`.

## Dependency direction

```
apps/*  ──►  packages/{ui,types,permissions,utils}
apps/api ──► packages/db
packages/ui ──► packages/utils (allowed), never ──► packages/db
packages/permissions ──► nothing internal
packages/types ──► zod only
packages/db ──► @prisma/client only
```

Frontends **never** import `@ocean/db`. Database access exists only behind the API.

## Turborepo task graph

| Task        | Depends on | Cached | Notes                                |
| ----------- | ---------- | ------ | ------------------------------------ |
| `build`     | `^build`   | yes    | `.next/**`, `dist/**`                |
| `lint`      | `^build`   | yes    | needs built `dist` of workspace deps |
| `typecheck` | `^build`   | yes    |                                      |
| `test`      | `^build`   | yes    |                                      |
| `dev`       | —          | no     | persistent                           |
| `generate`  | —          | no     | Prisma client                        |

## Environment

One `.env` at the repo root (gitignored), documented by `.env.example`. The API validates it at boot
with a zod schema (`apps/api/src/config/env.ts`) and fails fast with a readable list of problems.
Next apps only read `NEXT_PUBLIC_*` variables.

## Code quality rules (from spec §114)

- No file should grow past a few hundred lines; split by responsibility, not by layer count.
- No business logic in React components or theme sections.
- No hard-coded tenant IDs, plan rules, or currencies; all flow from config/DB/entitlements.
- Centralized validation (zod schemas in `@ocean/types`, reused by API pipes and forms).
- Consistent error envelope ([09-api-conventions.md](./09-api-conventions.md)); no silent catches.
- Comments only where the _why_ is non-obvious.
