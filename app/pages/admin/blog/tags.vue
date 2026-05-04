<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import type { AdminBlogTag } from '~/features/admin/types/admin.types'
import AdminBlogTagFormModal from '~/features/admin/components/AdminBlogTagFormModal.vue'

useSeoMeta({
  title: 'Blog Tags - Admin',
})

const toast = useToast()

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

const { tags, total: apiTotal, error, isLoading } = useAdminBlogTags(queryParams)
const { mutateAsync: createTag, asyncStatus: createStatus } = useCreateBlogTag()
const { mutateAsync: updateTag, asyncStatus: updateStatus } = useUpdateBlogTag()
const { mutateAsync: deleteTag } = useDeleteBlogTag()

const modalOpen = ref(false)
const editingTag = ref<AdminBlogTag | null>(null)
const isModalLoading = computed(() =>
  createStatus.value === 'loading' || updateStatus.value === 'loading',
)

const columns: TableColumn<AdminBlogTag>[] = [
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

const openCreateModal = () => {
  editingTag.value = null
  modalOpen.value = true
}

const openEditModal = (tag: AdminBlogTag) => {
  editingTag.value = tag
  modalOpen.value = true
}

const onSubmit = async (data: { name: string, slug: string }) => {
  try {
    if (editingTag.value) {
      await updateTag({ id: editingTag.value.id, data })
      toast.add({ title: 'Tag updated', color: 'success' })
    }
    else {
      await createTag(data)
      toast.add({ title: 'Tag created', color: 'success' })
    }
    modalOpen.value = false
  }
  catch (err: unknown) {
    const error = err as { data?: { statusMessage?: string }, message?: string }
    toast.add({
      title: editingTag.value ? 'Failed to update tag' : 'Failed to create tag',
      description: error.data?.statusMessage || error.message || 'An error occurred',
      color: 'error',
    })
  }
}

const onDelete = async (tag: AdminBlogTag) => {
  try {
    await deleteTag(tag.id)
    toast.add({ title: 'Tag deleted', color: 'success' })
  }
  catch (err: unknown) {
    const error = err as { message?: string }
    toast.add({
      title: 'Failed to delete tag',
      description: error.message || 'An error occurred',
      color: 'error',
    })
  }
}

const getActionsItems = (tag: AdminBlogTag): DropdownMenuItem[][] => [
  [
    {
      label: 'Edit',
      icon: 'i-lucide-pencil',
      onSelect: () => openEditModal(tag),
    },
  ],
  [
    {
      label: 'Delete',
      icon: 'i-lucide-trash-2',
      color: 'error' as const,
      onSelect: () => onDelete(tag),
    },
  ],
]
</script>

<template>
  <div>
    <UAlert
      v-if="error"
      color="error"
      title="Failed to load tags"
      :description="error.message"
      icon="i-lucide-alert-circle"
      class="mb-4"
    />

    <AppResponsiveTable
      v-model:search="search"
      :columns="columns"
      :data="tags"
      :loading="isLoading"
      :server-side="true"
      search-placeholder="Search by name..."
      empty-icon="i-lucide-tag"
      empty-text="No tags found"
      :pagination="{ page, perPage, total: apiTotal }"
      :sortable-columns="['name', 'createdAt']"
      :get-sort-direction="getSortDirection"
      @select="openEditModal"
      @update:page="page = $event"
      @update:per-page="perPage = $event"
      @sort="handleSort"
    >
      <template #header-extra>
        <UButton
          icon="i-lucide-plus"
          label="Create"
          @click="openCreateModal"
        />
      </template>

      <template #name-cell="{ row }">
        <div class="flex items-center gap-3">
          <div class="flex items-center justify-center size-10 rounded-lg bg-primary/10">
            <UIcon name="i-lucide-tag" class="size-5 text-primary" />
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
            <UIcon name="i-lucide-tag" class="size-5 text-primary" />
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

    <AdminBlogTagFormModal
      v-model:open="modalOpen"
      :tag="editingTag"
      :is-loading="isModalLoading"
      @submit="onSubmit"
    />
  </div>
</template>
