<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
})

const route = useRoute()
const organisationId = computed(() => route.params.id as string)

const { organisation } = useAdminOrganisation(organisationId)

const links = computed<NavigationMenuItem[]>(() => [
  {
    label: 'General',
    icon: 'i-lucide-settings',
    to: ROUTES.admin.organisationEdit(organisationId.value),
    exact: true,
  },
  {
    label: 'Members',
    icon: 'i-lucide-users',
    to: ROUTES.admin.organisationMembers(organisationId.value),
  },
  {
    label: 'Teams',
    icon: 'i-lucide-users-round',
    to: ROUTES.admin.organisationTeams(organisationId.value),
  },
])
</script>

<template>
  <DashboardAdminPage
    :title="organisation?.name ?? 'Organisation'"
    :breadcrumb="[
      { label: 'Organisations', to: ROUTES.admin.organisations },
      { label: organisation?.name ?? 'Organisation' },
    ]"
  >
    <template #header:append>
      <UDashboardToolbar class="bg-elevated/50">
        <UNavigationMenu :items="links" highlight />
      </UDashboardToolbar>
    </template>

    <NuxtPage />
  </DashboardAdminPage>
</template>
