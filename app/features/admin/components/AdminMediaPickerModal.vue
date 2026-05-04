<script setup lang="ts">
import type { AdminMediaFile, AdminMediaFilesQueryParams } from '../types/admin.types'
import { useQueryCache } from '@pinia/colada'
import { useAdminMediaFiles } from '~/features/admin/composables/useAdminMediaFiles'
import { useUploadFile } from '~/features/files'
import { adminKeys } from '../api/admin.keys'

const emit = defineEmits<{
  select: [file: AdminMediaFile]
}>()

const isOpen = defineModel<boolean>('open', { default: false })

// Local state (not usePagination to avoid URL query params)
const search = ref('')
const debouncedSearch = ref('')
const page = ref(1)
const perPage = 24
const activeTab = ref<string | number>('browse')
const selectedFile = ref<AdminMediaFile | null>(null)

// Debounce search
let searchTimeout: ReturnType<typeof setTimeout> | undefined
watch(search, (val) => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    debouncedSearch.value = val
    page.value = 1
  }, 300)
})

// Query params for media files
const queryParams = computed<AdminMediaFilesQueryParams>(() => ({
  search: debouncedSearch.value || undefined,
  sort: ['-createdAt'],
  limit: perPage,
  offset: (page.value - 1) * perPage,
}))

const { files, total, isLoading } = useAdminMediaFiles(queryParams)

const totalPages = computed(() => Math.ceil(total.value / perPage))
const hasNextPage = computed(() => page.value < totalPages.value)
const hasPrevPage = computed(() => page.value > 1)

// Upload
const uploadFile = ref<File | null>(null)
const uploading = ref(false)
const toast = useToast()
const queryCache = useQueryCache()
const { mutateAsync: doUpload } = useUploadFile()

watch(uploadFile, async (newFile) => {
  if (!newFile)
    return

  uploading.value = true
  try {
    const { file: uploaded } = await doUpload({
      file: newFile,
      entityType: 'media-library',
    })

    // Auto-select the uploaded file and switch to browse tab
    selectedFile.value = {
      id: uploaded.id,
      filename: uploaded.filename,
      originalName: uploaded.originalName,
      mimeType: uploaded.mimeType,
      size: uploaded.size,
      url: uploaded.url,
      entityType: uploaded.entityType ?? null,
      createdAt: uploaded.createdAt,
      updatedAt: uploaded.updatedAt,
      metadata: null,
    }
    activeTab.value = 'browse'
    queryCache.invalidateQueries({ key: adminKeys.mediaFiles() })
    toast.add({ title: 'Image uploaded', color: 'success' })
  }
  catch {
    toast.add({ title: 'Failed to upload image', color: 'error' })
  }
  finally {
    uploading.value = false
    uploadFile.value = null
  }
})

// Selection
const isSelected = (file: AdminMediaFile) => selectedFile.value?.id === file.id

const selectFile = (file: AdminMediaFile) => {
  selectedFile.value = file
}

const confirmSelection = () => {
  if (!selectedFile.value)
    return
  emit('select', selectedFile.value)
  isOpen.value = false
}

const selectAndInsert = (file: AdminMediaFile) => {
  selectedFile.value = file
  confirmSelection()
}

// Reset on close
watch(isOpen, (open) => {
  if (!open) {
    search.value = ''
    debouncedSearch.value = ''
    page.value = 1
    selectedFile.value = null
    activeTab.value = 'browse'
    uploadFile.value = null
  }
})

const formatSize = (bytes: number) => {
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const tabItems = [
  { label: 'Browse Library', icon: 'i-lucide-images', value: 'browse', slot: 'browse' },
  { label: 'Upload New', icon: 'i-lucide-upload', value: 'upload', slot: 'upload' },
]
</script>

<template>
  <UModal
    v-model:open="isOpen"
    title="Select Image"
    description="Choose an image from the media library or upload a new one."
    :ui="{ content: 'sm:max-w-3xl' }"
  >
    <template #body>
      <UTabs v-model="activeTab" :items="tabItems" class="w-full">
        <!-- Browse Library Tab -->
        <template #browse>
          <div class="space-y-4 pt-4">
            <!-- Search -->
            <UInput
              v-model="search"
              icon="i-lucide-search"
              placeholder="Search files..."
              class="w-full"
            />

            <!-- Loading skeleton -->
            <div v-if="isLoading && files.length === 0">
              <div class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <div v-for="i in 12" :key="i" class="aspect-square rounded-lg bg-elevated animate-pulse" />
              </div>
            </div>

            <!-- Empty state -->
            <div v-else-if="files.length === 0" class="py-12 text-center text-muted">
              <UIcon name="i-lucide-images" class="size-8 mx-auto mb-2 opacity-50" />
              <p v-if="debouncedSearch">
                No results for "{{ debouncedSearch }}"
              </p>
              <p v-else>
                No media files yet
              </p>
            </div>

            <!-- Image grid -->
            <div v-else>
              <div class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <button
                  v-for="file in files"
                  :key="file.id"
                  class="group relative aspect-square rounded-lg overflow-hidden border transition-all focus:outline-none cursor-pointer"
                  :class="isSelected(file) ? 'ring-2 ring-primary border-primary' : 'border-default hover:border-primary/50'"
                  @click="selectFile(file)"
                  @dblclick="selectAndInsert(file)"
                >
                  <img
                    :src="file.url"
                    :alt="file.metadata?.alt || file.originalName"
                    class="size-full object-cover"
                    :style="file.metadata ? { objectPosition: `${file.metadata.focusX * 100}% ${file.metadata.focusY * 100}%` } : undefined"
                    loading="lazy"
                  >
                  <!-- Selected checkmark overlay -->
                  <div
                    v-if="isSelected(file)"
                    class="absolute inset-0 bg-primary/10 flex items-center justify-center"
                  >
                    <div class="size-8 rounded-full bg-primary flex items-center justify-center">
                      <UIcon name="i-lucide-check" class="size-5 text-white" />
                    </div>
                  </div>
                  <!-- Hover overlay with file info -->
                  <div
                    v-else
                    class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 translate-y-full group-hover:translate-y-0 transition-transform"
                  >
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
            <div v-if="totalPages > 1" class="flex items-center justify-between pt-2">
              <span class="text-sm text-muted">
                Page {{ page }} of {{ totalPages }}
              </span>
              <div class="flex items-center gap-2">
                <UButton
                  :disabled="!hasPrevPage"
                  variant="outline"
                  size="xs"
                  icon="i-lucide-chevron-left"
                  aria-label="Previous page"
                  @click="page--"
                />
                <UButton
                  :disabled="!hasNextPage"
                  variant="outline"
                  size="xs"
                  icon="i-lucide-chevron-right"
                  aria-label="Next page"
                  @click="page++"
                />
              </div>
            </div>
          </div>
        </template>

        <!-- Upload New Tab -->
        <template #upload>
          <div class="pt-4">
            <UFileUpload
              v-model="uploadFile"
              accept="image/*"
              label="Upload an image"
              description="SVG, PNG, JPG or GIF (max. 2MB)"
              :preview="false"
              class="min-h-48"
            >
              <template #leading>
                <UAvatar
                  :icon="uploading ? 'i-lucide-loader-circle' : 'i-lucide-image'"
                  size="xl"
                  :ui="{ icon: [uploading && 'animate-spin'] }"
                />
              </template>
            </UFileUpload>
          </div>
        </template>
      </UTabs>
    </template>

    <template #footer>
      <div class="flex items-center justify-end gap-3">
        <UButton
          variant="ghost"
          color="neutral"
          @click="isOpen = false"
        >
          Cancel
        </UButton>
        <UButton
          :disabled="!selectedFile"
          @click="confirmSelection"
        >
          Insert Image
        </UButton>
      </div>
    </template>
  </UModal>
</template>
