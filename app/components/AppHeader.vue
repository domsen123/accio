<script setup lang="ts">
import { useStopImpersonation } from '~/features/admin/composables/useImpersonation'

const router = useRouter()
const toast = useToast()
const { t } = useI18n()

const { user, isAuthenticated, isAnonymous, isLoading, isImpersonating } = useSession()
const { isGlobalAdmin } = usePermissions()
const { mutateAsync: logout, asyncStatus: logoutStatus } = useLogout()
const { mutateAsync: stopImpersonation, asyncStatus: stopImpersonationStatus } = useStopImpersonation()

const items = computed(() => [])

const handleLogout = () => {
  logout()
    .then(() => {
      toast.add({
        title: t('shell.toasts.signed-out-title'),
        description: t('shell.toasts.signed-out-description'),
      })
      router.push(ROUTES.start)
    })
    .catch(() => {
      // Handle error silently
    })
}

const handleStopImpersonation = () => {
  stopImpersonation()
    .then(() => {
      toast.add({
        title: t('shell.toasts.impersonation-ended-title'),
        description: t('shell.toasts.impersonation-ended-description'),
        color: 'success',
      })
      router.push(ROUTES.admin.users)
    })
    .catch(() => {
      toast.add({
        title: t('shell.toasts.impersonation-failed-title'),
        description: t('shell.toasts.impersonation-failed-description'),
        color: 'error',
      })
    })
}

const isLoggingOut = computed(() => logoutStatus.value === 'loading')
const isStoppingImpersonation = computed(() => stopImpersonationStatus.value === 'loading')

// User dropdown items
const userMenuItems = computed(() => {
  const accountItem = [{
    label: user.value?.email ?? '',
    slot: 'account',
    disabled: true,
  }]

  const stopImpersonationItem = [{
    label: isStoppingImpersonation.value
      ? t('shell.header.stopping-impersonation')
      : t('shell.header.stop-impersonating'),
    icon: 'i-lucide-user-x',
    onSelect: handleStopImpersonation,
    disabled: isStoppingImpersonation.value,
  }]

  const settingsItem = [{
    label: t('shell.header.settings'),
    icon: 'i-lucide-settings',
    to: ROUTES.settings.profile,
  }]

  const adminItem = [{
    label: t('shell.header.admin-dashboard'),
    icon: 'i-lucide-shield',
    to: ROUTES.admin.home,
  }]

  const signOutItem = [{
    label: t('shell.header.sign-out'),
    icon: 'i-lucide-log-out',
    onSelect: handleLogout,
  }]

  // When impersonating, show stop impersonation option prominently
  if (isImpersonating.value) {
    return [accountItem, stopImpersonationItem, settingsItem, signOutItem]
  }

  if (isGlobalAdmin.value) {
    return [accountItem, settingsItem, adminItem, signOutItem]
  }

  return [accountItem, settingsItem, signOutItem]
})
</script>

<template>
  <UHeader>
    <template #left>
      <NuxtLink :to="{ path: ROUTES.start, force: true }">
        <AppLogo class="w-auto h-6 shrink-0" />
      </NuxtLink>
    </template>

    <UNavigationMenu
      :items="items"
      variant="link"
    />

    <template #right>
      <AppLocaleSwitcher />
      <UColorModeButton />

      <!-- Loading state -->
      <template v-if="isLoading">
        <USkeleton class="h-8 w-20 rounded-md" />
      </template>

      <!-- Authenticated state -->
      <template v-else-if="isAuthenticated && user && !isAnonymous">
        <UDropdownMenu :items="userMenuItems">
          <UButton
            color="neutral"
            variant="ghost"
            :loading="isLoggingOut"
          >
            <UAvatar
              :alt="user.name ?? user.email ?? undefined"
              size="2xs"
            />
            <span class="hidden lg:inline truncate max-w-32">
              {{ user.name || user.email || $t('common.guest') }}
            </span>
            <UIcon name="i-lucide-chevron-down" class="hidden lg:inline" />
          </UButton>
        </UDropdownMenu>
      </template>

      <!-- Unauthenticated state -->
      <template v-else>
        <UButton
          icon="i-lucide-log-in"
          color="neutral"
          variant="ghost"
          :to="ROUTES.auth.signIn"
          class="lg:hidden"
        />

        <UButton
          :label="$t('shell.header.sign-in')"
          color="neutral"
          variant="outline"
          :to="ROUTES.auth.signIn"
          class="hidden lg:inline-flex"
        />

        <UButton
          :label="$t('shell.header.sign-up')"
          color="neutral"
          trailing-icon="i-lucide-arrow-right"
          class="hidden lg:inline-flex"
          :to="ROUTES.auth.signUp"
        />
      </template>
    </template>

    <template #body>
      <UNavigationMenu
        :items="items"
        orientation="vertical"
        class="-mx-2.5"
      />

      <USeparator class="my-6" />

      <!-- Mobile menu auth section -->
      <template v-if="isAuthenticated && user && !isAnonymous">
        <div class="px-2.5 py-2 text-sm text-muted">
          {{ $t('shell.header.signed-in-as', { email: user.email ?? $t('common.guest') }) }}
        </div>
        <UButton
          v-if="isImpersonating"
          :label="$t('shell.header.stop-impersonating')"
          color="warning"
          variant="subtle"
          icon="i-lucide-user-x"
          :loading="isStoppingImpersonation"
          block
          class="mb-3"
          @click="handleStopImpersonation"
        />
        <UButton
          :label="$t('shell.header.settings')"
          color="neutral"
          variant="subtle"
          icon="i-lucide-settings"
          :to="ROUTES.settings.profile"
          block
          class="mb-3"
        />
        <UButton
          v-if="isGlobalAdmin && !isImpersonating"
          :label="$t('shell.header.admin-dashboard')"
          color="neutral"
          variant="subtle"
          icon="i-lucide-shield"
          :to="ROUTES.admin.home"
          block
          class="mb-3"
        />
        <UButton
          :label="$t('shell.header.sign-out')"
          color="neutral"
          variant="subtle"
          icon="i-lucide-log-out"
          :loading="isLoggingOut"
          block
          @click="handleLogout"
        />
      </template>
      <template v-else>
        <UButton
          :label="$t('shell.header.sign-in')"
          color="neutral"
          variant="subtle"
          :to="ROUTES.auth.signIn"
          block
          class="mb-3"
        />
        <UButton
          :label="$t('shell.header.sign-up')"
          color="neutral"
          :to="ROUTES.auth.signUp"
          block
        />
      </template>
    </template>
  </UHeader>
</template>
