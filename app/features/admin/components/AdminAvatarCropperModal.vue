<script setup lang="ts">
import { CircleStencil, Cropper } from 'vue-advanced-cropper'
import 'vue-advanced-cropper/dist/style.css'

const props = defineProps<{
  imageFile: File | null
}>()

const emit = defineEmits<{
  confirm: [blob: Blob, mimeType: string]
}>()

const open = defineModel<boolean>('open', { default: false })

const cropperRef = ref()
const imageSrc = ref<string>()

watch(() => props.imageFile, (file) => {
  if (imageSrc.value) {
    URL.revokeObjectURL(imageSrc.value)
    imageSrc.value = undefined
  }
  if (file) {
    imageSrc.value = URL.createObjectURL(file)
  }
})

onUnmounted(() => {
  if (imageSrc.value) {
    URL.revokeObjectURL(imageSrc.value)
  }
})

const onConfirm = () => {
  const { canvas } = cropperRef.value.getResult()
  if (!canvas)
    return

  canvas.toBlob((blob: Blob | null) => {
    if (blob) {
      emit('confirm', blob, 'image/webp')
      open.value = false
    }
  }, 'image/webp', 0.9)
}

const onCancel = () => {
  open.value = false
}
</script>

<template>
  <UModal v-model:open="open" title="Crop Avatar" :dismissible="false">
    <template #body>
      <div class="flex flex-col gap-4">
        <div class="relative w-full aspect-square max-h-96 bg-black/5 dark:bg-white/5 rounded-lg overflow-hidden">
          <Cropper
            v-if="imageSrc"
            ref="cropperRef"
            :src="imageSrc"
            :stencil-component="CircleStencil"
            :stencil-props="{ aspectRatio: 1 }"
            class="h-full"
          />
        </div>

        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            label="Cancel"
            @click="onCancel"
          />
          <UButton
            label="Crop & Upload"
            icon="i-lucide-check"
            @click="onConfirm"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
