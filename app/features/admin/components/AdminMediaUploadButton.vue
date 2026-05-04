<script setup lang="ts">
import { useQueryCache } from '@pinia/colada'
import { useUploadFile } from '~/features/files/composables/useFileUpload'
import { adminKeys } from '../api/admin.keys'

const toast = useToast()
const queryCache = useQueryCache()
const { mutateAsync: uploadFile, asyncStatus } = useUploadFile()

const fileInput = ref<HTMLInputElement | null>(null)
const isUploading = computed(() => asyncStatus.value === 'loading')

const onButtonClick = () => {
  fileInput.value?.click()
}

const onFileChange = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const files = input.files
  if (!files?.length)
    return

  try {
    for (const file of files) {
      await uploadFile({ file, entityType: 'media-library' })
    }
    toast.add({ title: `${files.length > 1 ? `${files.length} files` : 'File'} uploaded`, color: 'success' })
    queryCache.invalidateQueries({ key: adminKeys.mediaFiles() })
  }
  catch {
    toast.add({ title: 'Upload failed', color: 'error' })
  }

  // Reset input so the same file can be re-selected
  input.value = ''
}
</script>

<template>
  <div>
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      multiple
      class="hidden"
      @change="onFileChange"
    >
    <UButton
      icon="i-lucide-upload"
      label="Upload"
      :loading="isUploading"
      @click="onButtonClick"
    />
  </div>
</template>
