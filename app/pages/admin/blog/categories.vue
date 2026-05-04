<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import type { AdminBlogCategory } from '~/features/admin/types/admin.types'
import AdminBlogCategoryFormModal from '~/features/admin/components/AdminBlogCategoryFormModal.vue'

useSeoMeta({
  title: 'Blog Categories - Admin',
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

const { categories, total: apiTotal, error, isLoading } = useAdminBlogCategories(queryParams)
const { mutateAsync: createCategory, asyncStatus: createStatus } = useCreateBlogCategory()
const { mutateAsync: updateCategory, asyncStatus: updateStatus } = useUpdateBlogCategory()
const { mutateAsync: deleteCategory } = useDeleteBlogCategory()

const modalOpen = ref(false)
const editingCategory = ref<AdminBlogCategory | null>(null)
const isModalLoading = computed(() =>
  createStatus.value === 'loading' || updateStatus.value === 'loading',
)

const columns: TableColumn<AdminBlogCategory>[] = [
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
  editingCategory.value = null
  modalOpen.value = true
}

const openEditModal = (category: AdminBlogCategory) => {
  editingCategory.value = category
  modalOpen.value = true
}

const onSubmit = async (data: { name: string, slug: string }) => {
  try {
    if (editingCategory.value) {
      await updateCategory({ id: editingCategory.value.id, data })
      toast.add({ title: 'Category updated', color: 'success' })
    }
    else {
      await createCategory(data)
      toast.add({ title: 'Category created', color: 'success' })
    }
    modalOpen.value = false
  }
  catch (err: unknown) {
    const error = err as { data?: { statusMessage?: string }, message?: string }
    toast.add({
      title: editingCategory.value ? 'Failed to update category' : 'Failed to create category',
      description: error.data?.statusMessage || error.message || 'An error occurred',
      color: 'error',
    })
  }
}

const onDelete = async (category: AdminBlogCategory) => {
  try {
    await deleteCategory(category.id)
    toast.add({ title: 'Category deleted', color: 'success' })
  }
  catch (err: unknown) {
    const error = err as { message?: string }
    toast.add({
      title: 'Failed to delete category',
      description: error.message || 'An error occurred',
      color: 'error',
    })
  }
}

const getActionsItems = (category: AdminBlogCategory): DropdownMenuItem[][] => [
  [
    {
      label: 'Edit',
      icon: 'i-lucide-pencil',
      onSelect: () => openEditModal(category),
    },
  ],
  [
    {
      label: 'Delete',
      icon: 'i-lucide-trash-2',
      color: 'error' as const,
      onSelect: () => onDelete(category),
    },
  ],
]
</script>

<template>
  <div>
    <UAlert
      v-if="error"
      color="error"
      title="Failed to load categories"
      :description="error.message"
      icon="i-lucide-alert-circle"
      class="mb-4"
    />

    <AppResponsiveTable
      v-model:search="search"
      :columns="columns"
      :data="categories"
      :loading="isLoading"
      :server-side="true"
      search-placeholder="Search by name..."
      empty-icon="i-lucide-folder"
      empty-text="No categories found"
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
            <UIcon name="i-lucide-folder" class="size-5 text-primary" />
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
            <UIcon name="i-lucide-folder" class="size-5 text-primary" />
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

    <AdminBlogCategoryFormModal
      v-model:open="modalOpen"
      :category="editingCategory"
      :is-loading="isModalLoading"
      @submit="onSubmit"
    />
  </div>
</template>
