<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import type { AdminUser } from '~/features/admin/types/admin.types'
import { useStartImpersonation } from '~/features/admin/composables/useImpersonation'

definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
})

useSeoMeta({
  title: 'Users - Admin',
})

const router = useRouter()
const toast = useToast()
const { user } = useSession()
const { mutateAsync: startImpersonation, asyncStatus: impersonationStatus } = useStartImpersonation()

const impersonatingUserId = ref<string | null>(null)

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

const { users, total: apiTotal, error, isLoading } = useAdminUsers(queryParams)

const columns: TableColumn<AdminUser>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'emailVerified', header: 'Verified' },
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

const onSelectUser = (user: AdminUser) => {
  router.push(ROUTES.admin.userEdit(user.id))
}

const handleImpersonate = async (userId: string) => {
  impersonatingUserId.value = userId
  try {
    await startImpersonation(userId)
    toast.add({
      title: 'Impersonation started',
      description: 'You are now viewing the app as this user.',
      color: 'success',
    })
    router.push(ROUTES.start)
  }
  catch {
    toast.add({
      title: 'Failed to impersonate',
      description: 'Could not start impersonation. Please try again.',
      color: 'error',
    })
  }
  finally {
    impersonatingUserId.value = null
  }
}

const getActionsItems = (row: AdminUser): DropdownMenuItem[][] => {
  const isSelf = user.value?.id === row.id
  const isImpersonating = impersonatingUserId.value === row.id && impersonationStatus.value === 'loading'

  return [
    [
      {
        label: 'View Details',
        icon: 'i-lucide-eye',
        onSelect: () => router.push(ROUTES.admin.userEdit(row.id)),
      },
    ],
    [
      {
        label: isImpersonating ? 'Impersonating...' : 'Impersonate',
        icon: 'i-lucide-user-check',
        disabled: isSelf || isImpersonating,
        onSelect: () => handleImpersonate(row.id),
      },
    ],
  ]
}
</script>

<template>
  <DashboardAdminPage title="Users">
    <div>
      <UAlert
        v-if="error"
        color="error"
        title="Failed to load users"
        :description="error.message"
        icon="i-lucide-alert-circle"
        class="mb-4"
      />

      <AppResponsiveTable
        v-model:search="search"
        :columns="columns"
        :data="users"
        :loading="isLoading"
        :server-side="true"
        search-placeholder="Search by name or email..."
        empty-icon="i-lucide-user"
        empty-text="No users found"
        :pagination="{ page, perPage, total: apiTotal }"
        :sortable-columns="['name', 'createdAt']"
        :get-sort-direction="getSortDirection"
        @select="onSelectUser"
        @update:page="page = $event"
        @update:per-page="perPage = $event"
        @sort="handleSort"
      >
        <template #name-cell="{ row }">
          <div class="flex items-center gap-3">
            <AppUserAvatar :user-id="row.original.id" :name="row.original.name" :email="row.original.email" size="lg" />
            <div class="text-sm">
              <p class="text-highlighted font-medium">
                {{ row.original.name || 'No name' }}
              </p>
              <p class="text-muted text-xs">
                {{ row.original.email ?? 'No email' }}
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
            <AppUserAvatar :user-id="item.id" :name="item.name" :email="item.email" size="lg" class="shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="text-highlighted font-medium truncate">
                {{ item.name || 'No name' }}
              </p>
              <p class="text-muted text-xs truncate">
                {{ item.email ?? 'No email' }}
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
    </div>
  </DashboardAdminPage>
</template>
