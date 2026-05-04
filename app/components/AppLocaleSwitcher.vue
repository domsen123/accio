<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { SupportedLocale } from '~~/shared/i18n.constants'
import { LOCALE_COOKIE_NAME } from '~~/shared/i18n.constants'
import { useUpdateProfile } from '~/features/profile/composables/useProfileMutations'

// Top-nav language switcher.
// - Authenticated users: persists choice on user.locale via PATCH /api/profile.
// - Anonymous users: persists choice in a cookie so it survives reloads.
// In both cases, the active i18n locale flips immediately so the UI updates live.

const { locale, locales, setLocale } = useI18n()
const { isAuthenticated, isAnonymous } = useSession()
const localeCookie = useCookie<string | null>(LOCALE_COOKIE_NAME, {
  // 1 year — preference is sticky for anonymous users.
  maxAge: 60 * 60 * 24 * 365,
  sameSite: 'lax',
})
const { mutateAsync: updateProfile } = useUpdateProfile()

const availableLocales = computed(() =>
  (locales.value as { code: string, name?: string }[]).map(l => ({
    code: l.code,
    name: l.name ?? l.code,
  })),
)

const activeLocaleName = computed(
  () => availableLocales.value.find(l => l.code === locale.value)?.name ?? locale.value,
)

const handleSelect = async (code: string) => {
  if (code === locale.value)
    return

  await setLocale(code as SupportedLocale)

  // Persist preference. For authenticated (non-anonymous) users -> profile;
  // otherwise -> cookie. We don't await the profile call to keep the UI snappy
  // and we swallow errors here; the local locale is already switched.
  if (isAuthenticated.value && !isAnonymous.value) {
    updateProfile({ locale: code }).catch(() => {})
  }
  else {
    localeCookie.value = code
  }
}

const items = computed<DropdownMenuItem[][]>(() => [
  availableLocales.value.map(l => ({
    label: l.name,
    icon: l.code === locale.value ? 'i-lucide-check' : undefined,
    onSelect: () => {
      handleSelect(l.code)
    },
  })),
])
</script>

<template>
  <UDropdownMenu :items="items">
    <UButton
      color="neutral"
      variant="ghost"
      icon="i-lucide-languages"
      :aria-label="$t('shell.language-switcher.aria-label')"
    >
      <span class="hidden lg:inline text-sm">{{ activeLocaleName }}</span>
    </UButton>
  </UDropdownMenu>
</template>
