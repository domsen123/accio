import { runScheduledSync } from '~~/server/features/projects/scheduled-sync'
import { getDatabase } from '~~/server/infrastructure/database/client'
import { container } from '~~/server/utils/container'

// Nitro scheduled task wrapper (T-4.5). Cron is wired in `nuxt.config.ts`
// against `NUXT_GITHUB_SYNC_INTERVAL_MINUTES`. The pure helper lives in
// `server/features/projects/scheduled-sync.ts` so it can be unit-tested
// without the Nitro auto-import globals.

export default defineTask({
  meta: {
    name: 'gh:sync-all',
    description: 'Sync GitHub data for every workspace with tracked repositories',
  },
  async run() {
    const result = await runScheduledSync({
      db: getDatabase('app'),
      ghSyncService: container.ghSyncService,
      logger: {
        info: (msg, data) => console.log(msg, data ?? {}),
        error: (msg, data) => console.error(msg, data ?? {}),
      },
    })
    console.log('[gh:sync-all] tick complete', { organisationCount: result.organisations.length })
    return { result }
  },
})
