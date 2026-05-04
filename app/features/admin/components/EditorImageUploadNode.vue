<script setup lang="ts">
import type { NodeViewProps } from '@tiptap/vue-3'
import { NodeViewWrapper } from '@tiptap/vue-3'
import { useUploadFile } from '~/features/files'

const props = defineProps<NodeViewProps>()

const file = ref<File | null>(null)
const loading = ref(false)
const toast = useToast()

const { mutateAsync: uploadFile } = useUploadFile()

watch(file, async (newFile) => {
  if (!newFile)
    return

  loading.value = true

  try {
    const { file: uploaded } = await uploadFile({
      file: newFile,
      entityType: 'media-library',
    })

    const pos = props.getPos()
    if (typeof pos !== 'number')
      return

    props.editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + 1 })
      .setImage({ src: uploaded.url })
      .run()
  }
  catch {
    toast.add({ title: 'Failed to upload image', color: 'error' })
  }
  finally {
    loading.value = false
  }
})
</script>

<template>
  <NodeViewWrapper>
    <UFileUpload
      v-model="file"
      accept="image/*"
      label="Upload an image"
      description="SVG, PNG, JPG or GIF (max. 2MB)"
      :preview="false"
      class="min-h-48"
    >
      <template #leading>
        <UAvatar
          :icon="loading ? 'i-lucide-loader-circle' : 'i-lucide-image'"
          size="xl"
          :ui="{ icon: [loading && 'animate-spin'] }"
        />
      </template>
    </UFileUpload>
  </NodeViewWrapper>
</template>
