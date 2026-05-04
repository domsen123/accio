<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const router = useRouter()
const toast = useToast()
const route = useRoute()
const open = ref(false)

const { user, isImpersonating } = useSession()
const { mutateAsync: logout, asyncStatus: logoutStatus } = useLogout()

// Sidebar navigation items
const navItems: NavigationMenuItem[][] = [
  [
    {
      label: 'Dashboard',
      icon: 'i-lucide-layout-dashboard',
      to: ROUTES.dashboard.home,
    },
  ],
]

const handleLogout = () => {
  logout()
    .then(() => {
      toast.add({ title: 'Signed out', description: 'See you soon!' })
      router.push(ROUTES.start)
    })
    .catch(() => {
      // Handle error silently
    })
}

const isLoggingOut = computed(() => logoutStatus.value === 'loading')

// User menu items
const userMenuItems = computed(() => {
  const accountItem = [{
    label: user.value?.email ?? '',
    slot: 'account',
    disabled: true,
  }]

  const backToAppItem = [{
    label: 'Back to App',
    icon: 'i-lucide-arrow-left',
    to: ROUTES.start,
  }]

  const signOutItem = [{
    label: 'Sign out',
    icon: 'i-lucide-log-out',
    onSelect: handleLogout,
  }]

  if (isImpersonating.value) {
    return [accountItem, backToAppItem, signOutItem]
  }

  return [accountItem, backToAppItem, signOutItem]
})

// Compute active state for nav items
const navItemsWithActive = computed(() =>
  navItems.map(group =>
    group.map(item => ({
      ...item,
      active: item.to === route.path || (item.to !== ROUTES.admin.home && route.path.startsWith(item.to as string)),
    })),
  ),
)
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar
      v-model:open="open"
      collapsible
      resizable
      class="bg-elevated/75"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink :to="ROUTES.admin.home" class="flex items-center gap-2 px-2">
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
            <span class="truncate">{{ user?.name || user?.email || 'Guest' }}</span>
            <UIcon name="i-lucide-chevron-down" class="ml-auto" />
          </UButton>
        </UDropdownMenu>
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
