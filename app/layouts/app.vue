<script setup lang="ts">
// Hub shell layout for /app/** pages.
//
// Structure:
//   - Top bar (UDashboardNavbar): app logo, workspace switcher placeholder,
//     global search placeholder, language switcher, orchestrator launcher
//     placeholder, user menu.
//   - Side nav (UDashboardSidebar + UNavigationMenu): KB, Todos, Projects,
//     Orchestrator, Settings — entries link to pages that may not exist yet.
//
// Auth:
//   The global auth middleware at app/middleware/auth.global.ts gates routes
//   via `definePageMeta({ auth: true })`. Every page using this layout MUST
//   set `auth: true` in its page meta.
//
// Placeholders (TODO in later phases):
//   - Workspace switcher dropdown action — switch active organisation.
//   - Global search input — wired up in T-1.x once KB / Todos are searchable.
//   - Orchestrator launcher button — opens the orchestrator overlay (T-4.x).

import type { NavigationMenuItem } from '@nuxt/ui'

const router = useRouter()
const toast = useToast()
const route = useRoute()
const { t } = useI18n()

const open = ref(false)

const { user } = useSession()
const { mutateAsync: logout, asyncStatus: logoutStatus } = useLogout()

// Side-nav items. The link targets may 404 today; pages are added in their
// respective phase tasks.
const navItems = computed<NavigationMenuItem[][]>(() => [
  [
    {
      label: t('app.shell.nav.overview'),
      icon: 'i-lucide-home',
      to: '/app',
      exact: true,
    },
    {
      label: t('app.shell.nav.kb'),
      icon: 'i-lucide-book-open',
      to: '/app/kb',
    },
    {
      label: t('app.shell.nav.todos'),
      icon: 'i-lucide-list-todo',
      to: '/app/todos',
    },
    {
      label: t('app.shell.nav.projects'),
      icon: 'i-lucide-folder-git-2',
      to: '/app/projects',
    },
    {
      label: t('app.shell.nav.orchestrator'),
      icon: 'i-lucide-bot',
      to: '/app/orchestrator',
    },
    {
      label: t('vault.navLabel'),
      icon: 'i-lucide-shield',
      to: '/app/vault',
    },
    {
      label: t('app.shell.nav.settings'),
      icon: 'i-lucide-settings',
      to: '/app/settings',
    },
  ],
])

const isActive = (item: NavigationMenuItem) => {
  if (typeof item.to !== 'string')
    return false
  if (item.exact)
    return route.path === item.to
  return route.path === item.to || route.path.startsWith(`${item.to}/`)
}

const navItemsWithActive = computed(() =>
  navItems.value.map(group =>
    group.map(item => ({
      ...item,
      active: isActive(item),
    })),
  ),
)

// Workspace switcher placeholder. Real switching logic lands when the
// workspace context is exposed on the session payload.
// TODO: replace static label with active organisation name + switch action.
const workspaceLabel = computed(() => t('app.shell.workspaceSwitcher.placeholder'))

const workspaceMenuItems = computed(() => [[
  {
    label: t('app.shell.workspaceSwitcher.label'),
    slot: 'header',
    disabled: true,
  },
  {
    label: workspaceLabel.value,
    icon: 'i-lucide-check',
    disabled: true,
  },
]])

const handleLogout = () => {
  logout()
    .then(() => {
      toast.add({
        title: t('shell.toasts.signed-out-title'),
        description: t('shell.toasts.signed-out-description'),
      })
      router.push(ROUTES.auth.signIn)
    })
    .catch(() => {
      // Handle error silently
    })
}

const isLoggingOut = computed(() => logoutStatus.value === 'loading')

const userMenuItems = computed(() => {
  const accountItem = [{
    label: user.value?.email ?? '',
    slot: 'account',
    disabled: true,
  }]

  const settingsItem = [{
    label: t('shell.header.settings'),
    icon: 'i-lucide-settings',
    to: ROUTES.settings.profile,
  }]

  const signOutItem = [{
    label: t('shell.header.sign-out'),
    icon: 'i-lucide-log-out',
    onSelect: handleLogout,
  }]

  return [accountItem, settingsItem, signOutItem]
})

// TODO: wire up the orchestrator launcher to open the orchestrator overlay
// (planned for the Orchestrator phase).
const handleOrchestratorLaunch = () => {
  // no-op placeholder
}
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar
      v-model:open="open"
      collapsible
      resizable
      class="bg-muted"
      :ui="{
        root: 'border-r border-default',
        footer: 'lg:border-t lg:border-default',
      }"
    >
      <template #header="{ collapsed }">
        <NuxtLink to="/app" class="flex items-center gap-2 px-2">
          <AppLogo :collapsed="collapsed" />
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="navItemsWithActive"
          orientation="vertical"
          tooltip
          popover
        />
      </template>

      <template #footer>
        <UDropdownMenu :items="userMenuItems">
          <UButton
            color="neutral"
            variant="ghost"
            class="w-full justify-start"
            :loading="isLoggingOut"
          >
            <UAvatar
              :alt="user?.name ?? user?.email ?? undefined"
              size="2xs"
            />
            <span class="truncate">{{ user?.name || user?.email || $t('common.guest') }}</span>
            <UIcon name="i-lucide-chevron-down" class="ml-auto" />
          </UButton>
        </UDropdownMenu>
      </template>
    </UDashboardSidebar>

    <UDashboardPanel id="app-shell">
      <template #header>
        <UDashboardNavbar
          :ui="{ root: 'border-b border-default', right: 'gap-2' }"
          class="bg-default"
        >
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>

          <template #title>
            <UDropdownMenu :items="workspaceMenuItems">
              <UButton
                color="neutral"
                variant="ghost"
                trailing-icon="i-lucide-chevron-down"
                :aria-label="$t('app.shell.workspaceSwitcher.label')"
              >
                <UIcon name="i-lucide-building-2" class="size-4" />
                <span class="truncate max-w-40">{{ workspaceLabel }}</span>
              </UButton>
            </UDropdownMenu>
          </template>

          <template #right>
            <UInput
              :placeholder="$t('app.shell.search.placeholder')"
              icon="i-lucide-search"
              color="neutral"
              variant="outline"
              class="hidden md:block w-64"
              disabled
              :aria-label="$t('app.shell.search.placeholder')"
            />

            <UButton
              icon="i-lucide-sparkles"
              color="primary"
              variant="soft"
              :aria-label="$t('app.shell.orchestrator.launch')"
              @click="handleOrchestratorLaunch"
            >
              <span class="hidden lg:inline">{{ $t('app.shell.orchestrator.launch') }}</span>
            </UButton>

            <VaultLockIndicator />

            <AppLocaleSwitcher />
            <UColorModeButton />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div>
          <slot />
        </div>
      </template>
    </UDashboardPanel>
    <VaultUnlockDialog />
  </UDashboardGroup>
</template>
