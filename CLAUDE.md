# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nuxt 4 SaaS starter template using vertical slice architecture. Full-stack TypeScript application with PostgreSQL backend.

## Commands

```bash
# Development
pnpm dev                    # Start dev server (localhost:3000)
pnpm lint                   # Run ESLint
pnpm typecheck              # TypeScript checking

# Build
pnpm build                  # Production build
pnpm preview                # Preview production build

# Database (PostgreSQL via Docker)
pnpm docker:up              # Start PostgreSQL container
pnpm docker:clean           # Clean/rebuild containers
pnpm db:push                # Push schema to database
pnpm db:generate            # Generate migrations
pnpm db:migrate             # Apply migrations
pnpm db:studio              # Open Drizzle Studio UI
```

## Architecture

This project follows **vertical slice architecture** - features are organized as self-contained slices rather than horizontal layers.

### Directory Structure

- **app/** - Nuxt client-side application
  - `features/` - Feature slices (components, composables, types, API wrappers)
  - `components/` - Shared global components (App-prefixed)
  - `layouts/` - Page layouts (default, auth)
  - `pages/` - File-based routing
  - `utils/routes.ts` - Route constants

- **server/** - Nitro backend
  - `features/` - Feature services
  - `database/schema/` - Drizzle ORM schemas
  - `database/migrations/` - Generated migrations
  - `infrastructure/database/client.ts` - Drizzle client setup
  - `middleware/auth.ts` - Session injection
  - `utils/container.ts` - Dependency injection composition root
  - `api/` - API routes (thin, delegate to services)

- **shared/** - Cross-cutting types and utilities

### Key Patterns

**Services**: Use generic ItemService pattern for type-safe CRUD with filter operators (_eq, _gt, _in, _like, etc.), sorting, pagination, and relation support.

**Dependency Injection**: Factory functions in `server/utils/container.ts` - services receive dependencies explicitly.

**State Management**: Pinia Colada for server state caching, integrated via composables.

**Authentication**: Self-implemented session-based auth with httpOnly cookies and database-backed sessions.

## Tech Stack

- **Framework**: Nuxt 4.2.2 (Vue 3)
- **UI**: Nuxt UI with Tailwind CSS
- **Database**: PostgreSQL + Drizzle ORM
- **State**: Pinia + Pinia Colada
- **Validation**: Zod
- **Package Manager**: pnpm 10.23.0
- **Node**: 22

## Database Workflow

1. Define schema in `server/database/schema/*.ts`
2. Run `pnpm db:generate` to create migration
3. Run `pnpm db:migrate` to apply migrations

## Environment Variables

Key variables (see `.env.example`):
- `NUXT_DATABASE_*` - PostgreSQL connection
- `NUXT_AUTH_SECRET` - Session secret
- `NUXT_SITE_NAME`, `NUXT_PUBLIC_SITE_URL` - Site config

## Pinia-Colada Queries
Use `useQuery` from Pinia-Colada for data fetching with caching. Example:

```typescript
const { data, isLoading } = useQuery(queryOptions, () => ({ param: value.value }))
```

## Reference

See `_ARCHITECTURE.md` for comprehensive vertical slice architecture documentation, including feature checklists and anti-patterns.

## Styles
- use arrow functions if possible
- use `pnpm lint --fix` and `pnpm typecheck` after code changes to ensure code quality
- common alias:
  - **./app**: ~/
  - **./server**: ~~server/
  - **./shared**: ~~shared/
- zod: keep in mind that we are on zod v4. (use context7)
  - use trim() for strings to avoid leading/trailing spaces
  - 
