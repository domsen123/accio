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
    'nuxt-mcp-dev',
    '@nuxt/test-utils/module',
  ],

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
    },
    prerender: {
      routes: [
        '/',
      ],
      crawlLinks: true,
    },
  },
})
