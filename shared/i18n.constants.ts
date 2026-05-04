// Single source of truth for which UI locales the app ships with.
// Mirrors the `locales` block in nuxt.config.ts. Used by:
// - Server-side Zod validation when the user updates their profile locale.
// - Client-side cookie fallback for anonymous users.
// - Type narrowing in the locale switcher component.
//
// Whenever a new locale is added, update both this list and the nuxt.config.ts
// `i18n.locales` array (and ship a matching `i18n/locales/<code>.json`).
export const SUPPORTED_LOCALES = ['de', 'en'] as const

export type SupportedLocale = typeof SUPPORTED_LOCALES[number]

export const LOCALE_COOKIE_NAME = 'i18n_locale'

export const isSupportedLocale = (value: unknown): value is SupportedLocale =>
  typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value)
