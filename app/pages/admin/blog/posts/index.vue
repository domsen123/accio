<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import type { AdminBlogPost } from '~/features/admin/types/admin.types'

useSeoMeta({
  title: 'Blog Posts - Admin',
})

const router = useRouter()
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

const { posts, total: apiTotal, error, isLoading } = useAdminBlogPosts(queryParams)
const { mutateAsync: deletePost } = useDeleteBlogPost()

const columns: TableColumn<AdminBlogPost>[] = [
  { accessorKey: 'title', header: 'Title' },
  { accessorKey: 'published', header: 'Status' },
  { accessorKey: 'category', header: 'Category' },
  { accessorKey: 'tags', header: 'Tags' },
  { accessorKey: 'author', header: 'Author' },
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

const getPostStatus = (post: AdminBlogPost) => {
  if (!post.published)
    return { label: 'Draft', color: 'neutral' as const }
  if (post.publishedAt && new Date(post.publishedAt) > new Date())
    return { label: 'Scheduled', color: 'warning' as const }
  return { label: 'Published', color: 'success' as const }
}

const onSelectPost = (post: AdminBlogPost) => {
  router.push(ROUTES.admin.blogPostEdit(post.id))
}

const onDelete = async (post: AdminBlogPost) => {
  try {
    await deletePost(post.id)
    toast.add({ title: 'Post deleted', color: 'success' })
  }
  catch (err: unknown) {
    const error = err as { message?: string }
    toast.add({
      title: 'Failed to delete post',
      description: error.message || 'An error occurred',
      color: 'error',
    })
  }
}

const getActionsItems = (post: AdminBlogPost): DropdownMenuItem[][] => [
  [
    {
      label: 'Edit',
      icon: 'i-lucide-pencil',
      onSelect: () => router.push(ROUTES.admin.blogPostEdit(post.id)),
    },
  ],
  [
    {
      label: 'Delete',
      icon: 'i-lucide-trash-2',
      color: 'error' as const,
      onSelect: () => onDelete(post),
    },
  ],
]
</script>

<template>
  <div>
    <UAlert
      v-if="error"
      color="error"
      title="Failed to load posts"
      :description="error.message"
      icon="i-lucide-alert-circle"
      class="mb-4"
    />

    <AppResponsiveTable
      v-model:search="search"
      :columns="columns"
      :data="posts"
      :loading="isLoading"
      :server-side="true"
      search-placeholder="Search by title or slug..."
      empty-icon="i-lucide-file-text"
      empty-text="No posts found"
      :pagination="{ page, perPage, total: apiTotal }"
      :sortable-columns="['title', 'createdAt']"
      :get-sort-direction="getSortDirection"
      @select="onSelectPost"
      @update:page="page = $event"
      @update:per-page="perPage = $event"
      @sort="handleSort"
    >
      <template #header-extra>
        <UButton
          icon="i-lucide-plus"
          label="Create"
          :to="ROUTES.admin.blogPostCreate"
        />
      </template>

      <template #title-cell="{ row }">
        <div class="flex items-center gap-3">
          <div class="flex items-center justify-center size-10 rounded-lg bg-primary/10">
            <UIcon name="i-lucide-file-text" class="size-5 text-primary" />
          </div>
          <div class="text-sm">
            <p class="text-highlighted font-medium">
              {{ row.original.title }}
            </p>
            <p class="text-muted text-xs">
              {{ row.original.slug }}
            </p>
          </div>
        </div>
      </template>

      <template #published-cell="{ row }">
        <UBadge
          :color="getPostStatus(row.original).color"
          variant="subtle"
        >
          {{ getPostStatus(row.original).label }}
        </UBadge>
      </template>

      <template #category-cell="{ row }">
        <span class="text-sm text-muted">
          {{ row.original.category?.name || '-' }}
        </span>
      </template>

      <template #tags-cell="{ row }">
        <div class="flex flex-wrap gap-1">
          <UBadge
            v-for="tag in row.original.tags"
            :key="tag.id"
            variant="subtle"
            size="xs"
          >
            {{ tag.name }}
          </UBadge>
          <span v-if="!row.original.tags.length" class="text-sm text-muted">-</span>
        </div>
      </template>

      <template #author-cell="{ row }">
        <span class="text-sm text-muted">
          {{ row.original.author?.name || row.original.author?.email || '-' }}
        </span>
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
            <UIcon name="i-lucide-file-text" class="size-5 text-primary" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <p class="text-highlighted font-medium truncate">
                {{ item.title }}
              </p>
              <UBadge
                :color="getPostStatus(item).color"
                variant="subtle"
                size="xs"
              >
                {{ getPostStatus(item).label }}
              </UBadge>
            </div>
            <p class="text-muted text-xs truncate">
              {{ item.slug }}
            </p>
            <div v-if="item.category || item.tags.length" class="flex flex-wrap items-center gap-1 mt-1">
              <UBadge v-if="item.category" variant="outline" size="xs">
                {{ item.category.name }}
              </UBadge>
              <UBadge
                v-for="tag in item.tags"
                :key="tag.id"
                variant="subtle"
                size="xs"
              >
                {{ tag.name }}
              </UBadge>
            </div>
          </div>
        </div>
      </template>
    </AppResponsiveTable>
  </div>
</template>
