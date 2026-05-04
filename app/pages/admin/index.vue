<script setup lang="ts">
import AdminRecentOrganisations from '~/features/admin/components/AdminRecentOrganisations.vue'
import AdminRecentUsers from '~/features/admin/components/AdminRecentUsers.vue'
import { useAdminStats } from '~/features/admin/composables/useAdminStats'

definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
})

useSeoMeta({
  title: 'Admin Dashboard',
})

const { stats, status } = useAdminStats()

const statCards = computed(() => [
  { title: 'Total Users', value: stats.value?.totalUsers ?? '—', icon: 'i-lucide-users' },
  { title: 'Verified Users', value: stats.value?.verifiedUsers ?? '—', icon: 'i-lucide-user-check' },
  { title: 'Unverified Users', value: stats.value?.unverifiedUsers ?? '—', icon: 'i-lucide-user-x' },
  { title: 'Organisations', value: stats.value?.totalOrganisations ?? '—', icon: 'i-lucide-building-2' },
  { title: 'Teams', value: stats.value?.totalTeams ?? '—', icon: 'i-lucide-users-round' },
  { title: 'Active Sessions', value: stats.value?.activeSessions ?? '—', icon: 'i-lucide-activity' },
])
</script>

<template>
  <DashboardAdminPage title="Dashboard">
    <div class="p-6 space-y-8">
      <div>
        <h1 class="text-2xl font-bold mb-6">
          Platform Overview
        </h1>

        <!-- Stats Grid -->
        <UPageGrid class="lg:grid-cols-3 gap-px">
          <UPageCard
            v-for="(card, index) in statCards"
            :key="card.title"
            :icon="card.icon"
            :title="card.title"
            variant="subtle"
            class="lg:rounded-none"
            :class="[
              index === 0 && 'lg:rounded-tl-lg',
              index === 2 && 'lg:rounded-tr-lg',
              index === 3 && 'lg:rounded-bl-lg',
              index === 5 && 'lg:rounded-br-lg',
            ]"
            :ui="{
              root: 'gap-3',
              leading: 'inline-flex items-center justify-center size-8 rounded-full bg-primary/10 ring ring-inset ring-primary/25',
              leadingIcon: 'size-4',
              title: 'text-xs uppercase text-muted font-medium',
            }"
          >
            <template #default>
              <p class="text-2xl font-semibold text-highlighted">
                {{ status === 'pending' ? 'Loading...' : card.value }}
              </p>
            </template>
          </UPageCard>
        </UPageGrid>
      </div>

      <!-- Recent Activity -->
      <div>
        <h2 class="text-lg font-semibold mb-4">
          Recent Activity
        </h2>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AdminRecentUsers />
          <AdminRecentOrganisations />
        </div>
      </div>
    </div>
  </DashboardAdminPage>
</template>
