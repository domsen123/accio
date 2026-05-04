<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import type { AdminTeam } from '~/features/admin/types/admin.types'

definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
})

useSeoMeta({
  title: 'Teams - Admin',
})

const router = useRouter()
const toast = useToast()

const organisationFilter = ref<string>()

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
  resetOnChange: [organisationFilter],
})

const allTeamsParams = computed(() => ({
  ...queryParams.value,
  organisationId: organisationFilter.value || undefined,
}))

const { teams, total, error, isLoading } = useAdminTeams(allTeamsParams)
const { mutateAsync: deleteTeam } = useDeleteTeam()

const columns: TableColumn<AdminTeam>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'createdAt', header: 'Created' },
  { id: 'actions' },
]

const organisationFilterOptions = computed(() => {
  const orgs = new Map<string, { id: string, name: string }>()
  teams.value.forEach((team) => {
    if (!orgs.has(team.organisation.id)) {
      orgs.set(team.organisation.id, team.organisation)
    }
  })
  const sortedOrgs = Array.from(orgs.values()).sort((a, b) => a.name.localeCompare(b.name))
  return sortedOrgs.map(org => ({ label: org.name, value: org.id }))
})

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const onSelectTeam = (team: AdminTeam) => {
  router.push(ROUTES.admin.team(team.id))
}

const handleDelete = async (team: AdminTeam) => {
  try {
    await deleteTeam(team.id)
    toast.add({
      title: 'Team deleted',
      description: `${team.name} has been deleted.`,
      icon: 'i-lucide-check',
      color: 'success',
    })
  }
  catch (err) {
    const message = (err as Error).message || 'Failed to delete team'
    toast.add({
      title: 'Error',
      description: message,
      icon: 'i-lucide-alert-circle',
      color: 'error',
    })
  }
}

const getActionsItems = (team: AdminTeam): DropdownMenuItem[][] => [
  [
    {
      label: 'View Details',
      icon: 'i-lucide-eye',
      onSelect: () => router.push(ROUTES.admin.team(team.id)),
    },
  ],
  [
    {
      label: 'Delete team',
      icon: 'i-lucide-trash-2',
      color: 'error' as const,
      onSelect: () => handleDelete(team),
    },
  ],
]
</script>

<template>
  <DashboardAdminPage title="Teams">
    <div>
      <UAlert
        v-if="error"
        color="error"
        title="Failed to load teams"
        :description="error.message"
        icon="i-lucide-alert-circle"
        class="mb-4"
      />

      <AppResponsiveTable
        v-model:search="search"
        v-model:filter="organisationFilter"
        :columns="columns"
        :data="teams"
        :loading="isLoading"
        :server-side="true"
        search-placeholder="Search by name..."
        empty-icon="i-lucide-users-round"
        empty-text="No teams found"
        :filter-options="organisationFilterOptions"
        filter-placeholder="Organisation"
        :pagination="{ page, perPage, total }"
        :sortable-columns="['name', 'createdAt']"
        :get-sort-direction="getSortDirection"
        @select="onSelectTeam"
        @update:page="page = $event"
        @update:per-page="perPage = $event"
        @sort="handleSort"
      >
        <template #name-cell="{ row }">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center size-10 rounded-lg bg-primary/10">
              <UIcon name="i-lucide-users-round" class="size-5 text-primary" />
            </div>
            <div class="text-sm">
              <p class="text-highlighted font-medium">
                {{ row.original.name }}
              </p>
              <p class="text-muted text-xs">
                {{ row.original.organisation.name }}
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
              <UIcon name="i-lucide-users-round" class="size-5 text-primary" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-highlighted font-medium truncate">
                {{ item.name }}
              </p>
              <p class="text-muted text-xs truncate">
                {{ item.organisation.name }}
              </p>
            </div>
          </div>
        </template>
      </AppResponsiveTable>
    </div>
  </DashboardAdminPage>
</template>
