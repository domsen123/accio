<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { AdminUser } from '../types/admin.types'
import { useAdminUsers } from '../composables/useAdminUsers'

const { users, status } = useAdminUsers({ limit: 5, sort: ['-createdAt'] })

const columns: TableColumn<AdminUser>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'emailVerified', header: 'Verified' },
  { accessorKey: 'createdAt', header: 'Created' },
]

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const onSelect = (user: AdminUser) => {
  navigateTo(`/admin/users/${user.id}`)
}
</script>

<template>
  <AppResponsiveTable
    :columns="columns"
    :data="users"
    :loading="status === 'pending'"
    :searchable="false"
    empty-icon="i-lucide-users"
    empty-text="No users yet"
    @select="onSelect"
  >
    <template #header-extra>
      <div class="flex items-center justify-between flex-1">
        <div class="flex items-center gap-2">
          <div class="inline-flex items-center justify-center size-8 rounded-full bg-primary/10 ring ring-inset ring-primary/25">
            <UIcon name="i-lucide-users" class="size-4 text-primary" />
          </div>
          <h3 class="text-xs uppercase text-muted font-medium">
            Recent Users
          </h3>
        </div>
        <NuxtLink
          to="/admin/users"
          class="text-sm text-primary hover:underline"
        >
          View all
        </NuxtLink>
      </div>
    </template>

    <template #name-cell="{ row }">
      <div class="flex items-center gap-3">
        <div class="flex items-center justify-center size-10 rounded-lg bg-primary/10">
          <UIcon name="i-lucide-user" class="size-5 text-primary" />
        </div>
        <div class="text-sm">
          <p class="text-highlighted font-medium">
            {{ row.original.name || 'No name' }}
          </p>
          <p class="text-muted text-xs">
            {{ row.original.email }}
          </p>
        </div>
      </div>
    </template>

    <template #emailVerified-cell="{ row }">
      <UBadge
        :color="row.original.emailVerified ? 'success' : 'neutral'"
        variant="subtle"
      >
        {{ row.original.emailVerified ? 'Verified' : 'Unverified' }}
      </UBadge>
    </template>

    <template #createdAt-cell="{ row }">
      {{ formatDate(row.original.createdAt) }}
    </template>

    <template #mobile-card="{ item }">
      <div class="flex items-center gap-3 p-4">
        <div class="flex items-center justify-center size-10 rounded-lg bg-primary/10 shrink-0">
          <UIcon name="i-lucide-user" class="size-5 text-primary" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-highlighted font-medium truncate">
            {{ item.name || 'No name' }}
          </p>
          <p class="text-muted text-xs truncate">
            {{ item.email }}
          </p>
        </div>
        <UBadge
          :color="item.emailVerified ? 'success' : 'neutral'"
          variant="subtle"
          class="shrink-0"
        >
          {{ item.emailVerified ? 'Verified' : 'Unverified' }}
        </UBadge>
      </div>
    </template>
  </AppResponsiveTable>
</template>
