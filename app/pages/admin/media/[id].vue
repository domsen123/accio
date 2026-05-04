<script setup lang="ts">
import AdminMediaFocusPicker from '~/features/admin/components/AdminMediaFocusPicker.vue'
import { useAdminMediaFile } from '~/features/admin/composables/useAdminMediaFile'
import { useDeleteMediaFile, useUpdateMediaMetadata } from '~/features/admin/composables/useAdminMediaMutations'

definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
})

const route = useRoute()
const router = useRouter()
const toast = useToast()

const fileId = computed(() => route.params.id as string)
const { file, status, error } = useAdminMediaFile(fileId)

const isPageLoading = computed(() => status.value === 'pending')

const breadcrumbItems = computed(() => [
  { label: 'Media', to: ROUTES.admin.media },
  { label: file.value?.originalName ?? 'Media File' },
])

useSeoMeta({
  title: () => file.value
    ? `${file.value.originalName} - Media Library - Admin`
    : 'Media File - Admin',
})

const { mutateAsync: updateMetadata, asyncStatus: saveStatus } = useUpdateMediaMetadata()
const { mutateAsync: deleteFile, asyncStatus: deleteStatus } = useDeleteMediaFile()

const form = reactive({
  alt: '',
  title: '',
  description: '',
  focusX: 0.5,
  focusY: 0.5,
})

watch(file, (newFile) => {
  if (newFile) {
    form.alt = newFile.metadata?.alt ?? ''
    form.title = newFile.metadata?.title ?? ''
    form.description = newFile.metadata?.description ?? ''
    form.focusX = newFile.metadata?.focusX ?? 0.5
    form.focusY = newFile.metadata?.focusY ?? 0.5
  }
}, { immediate: true })

const isSaving = computed(() => saveStatus.value === 'loading')
const isDeleting = computed(() => deleteStatus.value === 'loading')

const formatSize = (bytes: number) => {
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

const onFocusUpdate = (coords: { focusX: number, focusY: number }) => {
  form.focusX = coords.focusX
  form.focusY = coords.focusY
}

const onSave = async () => {
  try {
    await updateMetadata({
      id: fileId.value,
      data: {
        alt: form.alt || null,
        title: form.title || null,
        description: form.description || null,
        focusX: form.focusX,
        focusY: form.focusY,
      },
    })
    toast.add({ title: 'Metadata saved', color: 'success' })
  }
  catch {
    toast.add({ title: 'Failed to save metadata', color: 'error' })
  }
}

const onDelete = async () => {
  try {
    await deleteFile(fileId.value)
    toast.add({ title: 'File deleted', color: 'success' })
    router.push(ROUTES.admin.media)
  }
  catch {
    toast.add({ title: 'Failed to delete file', color: 'error' })
  }
}
</script>

<template>
  <DashboardAdminPage :title="file?.originalName ?? 'Media File'">
    <div class="w-full lg:max-w-5xl mx-auto py-6 px-6 lg:py-12">
      <UBreadcrumb :items="breadcrumbItems" class="mb-6" />
      <div v-if="isPageLoading" class="flex items-center justify-center py-12">
        <UIcon name="i-lucide-loader-2" class="animate-spin size-8 text-muted" />
      </div>

      <UAlert
        v-else-if="error"
        color="error"
        title="Failed to load media file"
        :description="error.message"
        icon="i-lucide-alert-circle"
      />

      <template v-else-if="file">
        <!-- Two-column layout: Metadata + Focus Picker -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <!-- Left: Metadata -->
          <div class="lg:col-span-7 space-y-4">
            <!-- File info -->
            <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
              <span>{{ file.mimeType }}</span>
              <span>{{ formatSize(file.size) }}</span>
              <span>Uploaded {{ formatDate(file.createdAt) }}</span>
            </div>

            <!-- Metadata form -->
            <UPageCard title="Metadata" variant="subtle">
              <div class="space-y-4">
                <UFormField label="Title">
                  <UInput v-model="form.title" placeholder="Image title..." />
                </UFormField>

                <UFormField label="Alt text">
                  <UInput v-model="form.alt" placeholder="Describe the image..." />
                </UFormField>

                <UFormField label="Description">
                  <UTextarea v-model="form.description" placeholder="Additional details..." :rows="3" />
                </UFormField>
              </div>
            </UPageCard>

            <!-- Actions -->
            <div class="flex gap-3">
              <UButton
                label="Save"
                icon="i-lucide-save"
                :loading="isSaving"
                @click="onSave"
              />
              <UButton
                label="Delete"
                icon="i-lucide-trash-2"
                color="error"
                variant="soft"
                :loading="isDeleting"
                @click="onDelete"
              />
            </div>
          </div>

          <!-- Right: Focus Point -->
          <div class="lg:col-span-5 space-y-4 lg:sticky lg:top-4 lg:self-start">
            <UPageCard title="Focus Point" variant="subtle">
              <div class="space-y-3">
                <AdminMediaFocusPicker
                  :src="file.url"
                  :focus-x="form.focusX"
                  :focus-y="form.focusY"
                  @update="onFocusUpdate"
                />
                <div class="flex items-center justify-between text-xs text-muted">
                  <span>Click on the image to set focus</span>
                  <span>{{ form.focusX.toFixed(2) }}, {{ form.focusY.toFixed(2) }}</span>
                </div>
              </div>
            </UPageCard>
          </div>
        </div>
      </template>
    </div>
  </DashboardAdminPage>
</template>
