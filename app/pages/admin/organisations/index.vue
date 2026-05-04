<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import type { AdminOrganisation } from '~/features/admin/types/admin.types'

definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
})

useSeoMeta({
  title: 'Organisations - Admin',
})

const router = useRouter()

const {
  search,
  page,
  perPage,
  queryParams,
  handleSort,
  getSortDirection,
} = usePagination({
  defaultPerPage: 10,
  defaultSort: [{ key: 'createdAt', direction: 'desc' }],
})

const { organisations, total: apiTotal, error, isLoading } = useAdminOrganisations(queryParams)

const columns: TableColumn<AdminOrganisation>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'createdAt', header: 'Created' },
  { id: 'actions' },
]

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const onSelectOrganisation = (org: AdminOrganisation) => {
  router.push(ROUTES.admin.organisationEdit(org.id))
}

const getActionsItems = (org: AdminOrganisation): DropdownMenuItem[][] => [
  [
    {
      label: 'Edit',
      icon: 'i-lucide-pencil',
      onSelect: () => router.push(ROUTES.admin.organisationEdit(org.id)),
    },
  ],
]
</script>

<template>
  <DashboardAdminPage title="Organisations">
    <div>
      <UAlert
        v-if="error"
        color="error"
        title="Failed to load organisations"
        :description="error.message"
        icon="i-lucide-alert-circle"
        class="mb-4"
      />

      <AppResponsiveTable
        v-model:search="search"
        :columns="columns"
        :data="organisations"
        :loading="isLoading"
        :server-side="true"
        search-placeholder="Search by name or slug..."
        empty-icon="i-lucide-building-2"
        empty-text="No organisations found"
        :pagination="{ page, perPage, total: apiTotal }"
        :sortable-columns="['name', 'createdAt']"
        :get-sort-direction="getSortDirection"
        @select="onSelectOrganisation"
        @update:page="page = $event"
        @update:per-page="perPage = $event"
        @sort="handleSort"
      >
        <template #header-extra>
          <UButton
            icon="i-lucide-plus"
            label="Create"
            :to="ROUTES.admin.organisationCreate"
          />
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

        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UDropdownMenu :items="getActionsItems(row.original)" :content="{ align: 'end' }">
              <UButton
                icon="i-lucide-ellipsis-vertical"
                color="neutral"
                variant="ghost"
                @click.stop
              />
            </UDropdownMenu>
          </div>
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
    </div>
  </DashboardAdminPage>
</template>
