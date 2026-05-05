/**
 * Pinia Colada query keys for the AI Configuration feature (T-3.1e).
 * Convention follows `app/features/todo/api/todo.keys.ts`.
 */

export const aiKeys = {
  all: ['ai'] as const,
  providers: () => [...aiKeys.all, 'providers'] as const,
  models: () => [...aiKeys.all, 'models'] as const,
  credentials: () => [...aiKeys.all, 'credentials'] as const,
  settings: () => [...aiKeys.all, 'settings'] as const,

  admin: {
    all: ['ai', 'admin'] as const,
    providers: () => ['ai', 'admin', 'providers'] as const,
    models: () => ['ai', 'admin', 'models'] as const,
  },
}
