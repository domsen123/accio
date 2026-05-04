<script setup lang="ts">
import AdminMediaUploadButton from '~/features/admin/components/AdminMediaUploadButton.vue'
import { useAdminMediaFiles } from '~/features/admin/composables/useAdminMediaFiles'

definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
})

useSeoMeta({
  title: 'Media Library - Admin',
})

const router = useRouter()

const {
  search,
  page,
  perPage,
  queryParams,
} = usePagination({
  defaultPerPage: 24,
  defaultSort: [{ key: 'createdAt', direction: 'desc' }],
})

const { files, total, isLoading, error } = useAdminMediaFiles(queryParams)

const formatSize = (bytes: number) => {
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const totalPages = computed(() => Math.ceil(total.value / perPage.value))
const hasNextPage = computed(() => page.value < totalPages.value)
const hasPrevPage = computed(() => page.value > 1)

const rangeStart = computed(() => {
  if (total.value === 0)
    return 0
  return (page.value - 1) * perPage.value + 1
})

const rangeEnd = computed(() => Math.min(page.value * perPage.value, total.value))

const perPageOptions = [12, 24, 48, 96].map(n => ({ label: String(n), value: n }))

const onPerPageChange = (value: number) => {
  perPage.value = value
  page.value = 1
}
</script>

<template>
  <DashboardAdminPage title="Media Library">
    <div>
      <UAlert
        v-if="error"
        color="error"
        title="Failed to load media files"
        :description="error.message"
        icon="i-lucide-alert-circle"
        class="mb-4"
      />

      <UPageCard
        variant="subtle"
        :ui="{
          root: 'overflow-x-auto',
          container: 'p-0 sm:p-0 gap-y-0 min-w-0 lg:flex lg:flex-col',
          wrapper: 'items-stretch min-w-0 flex-none',
          header: 'p-4 mb-0 border-b border-default',
        }"
      >
        <!-- Header with search and upload -->
        <template #header>
          <div class="flex items-center gap-3">
            <UInput
              v-model="search"
              icon="i-lucide-search"
              placeholder="Search files..."
              class="flex-1"
            />
            <AdminMediaUploadButton />
          </div>
        </template>

        <!-- Loading state -->
        <div v-if="isLoading && files.length === 0" class="p-4">
          <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div v-for="i in 12" :key="i" class="aspect-square rounded-lg bg-elevated animate-pulse" />
          </div>
        </div>

        <!-- Empty state -->
        <div v-else-if="files.length === 0" class="py-12 text-center text-muted">
          <UIcon name="i-lucide-images" class="size-8 mx-auto mb-2 opacity-50" />
          <p v-if="search">
            No results for "{{ search }}"
          </p>
          <p v-else>
            No media files yet
          </p>
        </div>

        <!-- Grid -->
        <div v-else class="p-4">
          <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <button
              v-for="file in files"
              :key="file.id"
              class="group relative aspect-square rounded-lg overflow-hidden border border-default hover:border-primary/50 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
              @click="router.push(ROUTES.admin.mediaEdit(file.id))"
            >
              <img
                :src="file.url"
                :alt="file.metadata?.alt || file.originalName"
                class="size-full object-cover"
                :style="file.metadata ? { objectPosition: `${file.metadata.focusX * 100}% ${file.metadata.focusY * 100}%` } : undefined"
                loading="lazy"
              >
              <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 translate-y-full group-hover:translate-y-0 transition-transform">
                <p class="text-white text-xs truncate">
                  {{ file.originalName }}
                </p>
                <p class="text-white/70 text-xs">
                  {{ formatSize(file.size) }}
                </p>
              </div>
            </button>
          </div>
        </div>

        <!-- Pagination -->
        <div class="flex items-center justify-between p-4 border-t border-default">
          <!-- Desktop pagination -->
          <div class="hidden md:flex items-center gap-3">
            <USelect
              :model-value="perPage"
              :items="perPageOptions"
              class="w-20"
              @update:model-value="onPerPageChange"
            />
            <span class="text-sm text-muted">
              {{ rangeStart }}-{{ rangeEnd }} of {{ total }}
            </span>
          </div>
          <UPagination
            v-if="totalPages > 1"
            :default-page="page"
            :total="total"
            :items-per-page="perPage"
            :sibling-count="1"
            :show-edges="false"
            class="hidden md:flex"
            @update:page="page = $event"
          />

          <!-- Mobile pagination -->
          <div class="flex md:hidden items-center justify-between w-full">
            <UButton
              :disabled="!hasPrevPage"
              variant="outline"
              icon="i-lucide-chevron-left"
              aria-label="Previous page"
              @click="page = page - 1"
            />
            <span class="text-sm text-muted">
              {{ page }} / {{ totalPages }}
            </span>
            <UButton
              :disabled="!hasNextPage"
              variant="outline"
              icon="i-lucide-chevron-right"
              aria-label="Next page"
              @click="page = page + 1"
            />
          </div>
        </div>
      </UPageCard>
    </div>
  </DashboardAdminPage>
</template>
