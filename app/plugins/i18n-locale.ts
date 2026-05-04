import { isSupportedLocale, LOCALE_COOKIE_NAME } from '~~/shared/i18n.constants'

/**
 * Sync the active i18n locale to the user's preference on app boot / session change.
 *
 * Resolution order (highest priority first):
 *   1. Authenticated, non-anonymous user with a `locale` field on the session.
 *   2. `i18n_locale` cookie (set by AppLocaleSwitcher for anonymous users).
 *   3. Otherwise: the i18n module's default (NUXT_PUBLIC_I18N_DEFAULT_LOCALE / 'de').
 *
 * Runs after `api.ts` so the SSR-prefetched session is in payload + Pinia Colada cache.
 *
 * NOTE: vue-i18n's `useI18n` is a component-only composable and throws when called
 * outside `setup()`. We reach the global instance via `nuxtApp.$i18n` instead.
 */
export default defineNuxtPlugin({
  name: 'i18n-locale',
  // Run after the API plugin which seeds the session.
  dependsOn: ['api'],
  setup: (nuxtApp) => {
    const $i18n = nuxtApp.$i18n as {
      locale: { value: string }
      setLocale: (locale: string) => Promise<void>
    }
    const localeCookie = useCookie<string | null>(LOCALE_COOKIE_NAME)

    const applyLocale = async (next: string | null | undefined) => {
      if (!next || !isSupportedLocale(next))
        return
      if (next === $i18n.locale.value)
        return
      await $i18n.setLocale(next)
    }

    // SSR + initial CSR: pull from session if logged in, else cookie.
    const { user, isAnonymous } = useSession()
    const initialLocale = user.value && !isAnonymous.value
      ? user.value.locale
      : localeCookie.value

    void applyLocale(initialLocale)

    // Keep i18n in sync when the session swaps (e.g. login/logout).
    watch(
      () => (user.value && !isAnonymous.value ? user.value.locale : null),
      (next) => {
        void applyLocale(next)
      },
    )
  },
})
