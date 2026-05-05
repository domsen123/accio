import process from 'node:process'

// GitHub sync cron expression — REQ-PROJ-3 default 15 min, configurable via
// NUXT_GITHUB_SYNC_INTERVAL_MINUTES. Resolved at config load time; restart to
// change.
const githubSyncIntervalMinutes = (() => {
  const raw = Number.parseInt(process.env.NUXT_GITHUB_SYNC_INTERVAL_MINUTES || '15', 10)
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 60) : 15
})()
const githubSyncCron = `*/${githubSyncIntervalMinutes} * * * *`

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxtjs/seo',
    '@nuxt/image',
    '@nuxt/ui',
    // '@nuxt/content',
    '@vueuse/nuxt',
    'nuxt-og-image',
    '@pinia/nuxt',
    '@pinia/colada-nuxt',
    '@nuxtjs/i18n',
    'nuxt-mcp-dev',
    '@nuxt/test-utils/module',
  ],

  i18n: {
    defaultLocale: process.env.NUXT_PUBLIC_I18N_DEFAULT_LOCALE || 'de',
    strategy: 'no_prefix',
    locales: [
      { code: 'de', file: 'de.json', name: 'Deutsch' },
      { code: 'en', file: 'en.json', name: 'English' },
    ],
  },

  devtools: {
    enabled: true,
  },

  css: ['~/assets/css/main.css'],

  imports: {
    dirs: [
      'features/**/composables',
    ],
  },

  components: {
    dirs: ['~/components', {
      path: '~/features',
      pattern: '**/components/**/*.vue',
      pathPrefix: false,
    }],
  },

  // vite: {
  //   ssr: {
  //     external: ['sharp'],
  //   },
  // },

  compatibilityDate: '2024-07-11',

  nitro: {
    experimental: {
      tasks: true,
    },
    scheduledTasks: {
      // Run cleanup daily at 3:00 AM
      '0 3 * * *': ['cleanup:tokens'],
      // Run content creator queue processing daily at 9:00 AM
      '0 9 * * *': ['content-creator:generate'],
      // Sync GitHub data for every workspace with tracked repos
      // (REQ-PROJ-3, default every 15 min, configurable).
      [githubSyncCron]: ['gh:sync-all'],
    },
    prerender: {
      routes: [
        '/',
      ],
      crawlLinks: true,
    },
  },
})
