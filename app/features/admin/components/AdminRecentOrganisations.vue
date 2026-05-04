<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { AdminOrganisation } from '../types/admin.types'
import { useAdminOrganisations } from '../composables/useAdminOrganisations'

const { organisations, status } = useAdminOrganisations({ limit: 5, sort: ['-createdAt'] })

const columns: TableColumn<AdminOrganisation>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'createdAt', header: 'Created' },
]

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const onSelect = (org: AdminOrganisation) => {
  navigateTo(`/admin/organisations/${org.id}`)
}
</script>

<template>
  <AppResponsiveTable
    :columns="columns"
    :data="organisations"
    :loading="status === 'pending'"
    :searchable="false"
    empty-icon="i-lucide-building-2"
    empty-text="No organisations yet"
    @select="onSelect"
  >
    <template #header-extra>
      <div class="flex items-center justify-between flex-1">
        <div class="flex items-center gap-2">
          <div class="inline-flex items-center justify-center size-8 rounded-full bg-primary/10 ring ring-inset ring-primary/25">
            <UIcon name="i-lucide-building-2" class="size-4 text-primary" />
          </div>
          <h3 class="text-xs uppercase text-muted font-medium">
            Recent Organisations
          </h3>
        </div>
        <NuxtLink
          to="/admin/organisations"
          class="text-sm text-primary hover:underline"
        >
          View all
        </NuxtLink>
      </div>
    </template>

    <template #name-cell="{ row }">
      <div class="flex items-center gap-3">
        <div class="flex items-center justify-center size-10 rounded-lg bg-primary/10">
          <UIcon name="i-lucide-building-2" class="size-5 text-primary" />
        </div>
        <div class="text-sm">
          <p class="text-highlighted font-medium">
            {{ row.original.name }}
          </p>
          <p class="text-muted text-xs">
            {{ row.original.slug }}
          </p>
        </div>
      </div>
    </template>

    <template #createdAt-cell="{ row }">
      {{ formatDate(row.original.createdAt) }}
    </template>

    <template #mobile-card="{ item }">
      <div class="flex items-center gap-3 p-4">
        <div class="flex items-center justify-center size-10 rounded-lg bg-primary/10 shrink-0">
          <UIcon name="i-lucide-building-2" class="size-5 text-primary" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-highlighted font-medium truncate">
            {{ item.name }}
          </p>
          <p class="text-muted text-xs truncate">
            {{ item.slug }}
          </p>
        </div>
      </div>
    </template>
  </AppResponsiveTable>
</template>
