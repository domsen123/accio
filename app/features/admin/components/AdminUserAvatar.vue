<script setup lang="ts">
const props = defineProps<{
  userId: string
  userName: string | null
  userEmail: string | null
}>()

const toast = useToast()
const fileInput = ref<HTMLInputElement>()
const previewUrl = ref<string | null>(null)
const pendingFile = ref<File | null>(null)
const cropperOpen = ref(false)

const MAX_FILE_SIZE = 5 * 1024 * 1024
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

const userIdRef = computed(() => props.userId)
const { files, refresh } = useFilesByEntity('user-avatar', userIdRef)
const { mutateAsync: uploadFile, asyncStatus: uploadStatus } = useUploadFile()
const { mutateAsync: deleteFile, asyncStatus: deleteStatus } = useFileDelete()

const isUploading = computed(() => uploadStatus.value === 'loading')
const isDeleting = computed(() => deleteStatus.value === 'loading')
const isBusy = computed(() => isUploading.value || isDeleting.value)

const currentAvatar = computed(() => {
  if (!files.value.length)
    return null
  return files.value[files.value.length - 1]!
})

const avatarSrc = computed(() => {
  if (previewUrl.value)
    return previewUrl.value
  return undefined
})

const openFilePicker = () => {
  if (isBusy.value)
    return
  fileInput.value?.click()
}

const validateFile = (file: File): string | null => {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return 'Please select an image file (JPEG, PNG, GIF, or WebP).'
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'File size must be less than 5MB.'
  }
  return null
}

const onFileSelected = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file)
    return

  // Reset input so the same file can be re-selected
  input.value = ''

  const error = validateFile(file)
  if (error) {
    toast.add({ title: error, color: 'error' })
    return
  }

  pendingFile.value = file
  cropperOpen.value = true
}

const onCropConfirm = async (blob: Blob, mimeType: string) => {
  const file = new File([blob], `avatar-${props.userId}.webp`, { type: mimeType })

  // Show client-side preview immediately
  previewUrl.value = URL.createObjectURL(blob)

  try {
    const previousAvatar = currentAvatar.value

    await uploadFile({
      file,
      entityType: 'user-avatar',
      entityId: props.userId,
    })

    // Delete previous avatar to avoid orphans
    if (previousAvatar) {
      await deleteFile({
        id: previousAvatar.id,
        entityType: 'user-avatar',
        entityId: props.userId,
      })
    }

    toast.add({ title: 'Avatar updated.', color: 'success' })
  }
  catch {
    toast.add({ title: 'Failed to upload avatar. Please try again.', color: 'error' })
  }
  finally {
    pendingFile.value = null
    if (previewUrl.value) {
      URL.revokeObjectURL(previewUrl.value)
      previewUrl.value = null
    }
    await refresh()
  }
}

const removeAvatar = async () => {
  if (!currentAvatar.value || isBusy.value)
    return

  try {
    await deleteFile({
      id: currentAvatar.value.id,
      entityType: 'user-avatar',
      entityId: props.userId,
    })
    toast.add({ title: 'Avatar removed.', color: 'success' })
  }
  catch {
    toast.add({ title: 'Failed to remove avatar. Please try again.', color: 'error' })
  }
}
</script>

<template>
  <div class="flex flex-col items-center gap-2">
    <div class="relative group">
      <!-- Avatar -->
      <AppUserAvatar
        v-if="!avatarSrc"
        :user-id="userId"
        :name="userName"
        :email="userEmail"
        size="3xl"
        :ui="{ root: 'cursor-pointer' }"
        @click="openFilePicker"
      />
      <UAvatar
        v-else
        :src="avatarSrc"
        :alt="userName || userEmail || undefined"
        size="3xl"
        :ui="{ root: 'cursor-pointer' }"
        @click="openFilePicker"
      />

      <!-- Hover overlay -->
      <div
        class="absolute inset-0 rounded-full bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
        @click="openFilePicker"
      >
        <UIcon name="i-lucide-camera" class="text-white size-5" />
        <span class="text-white text-xs mt-0.5">Change</span>
      </div>

      <!-- Loading overlay -->
      <div
        v-if="isBusy"
        class="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center"
      >
        <UIcon name="i-lucide-loader-2" class="text-white size-5 animate-spin" />
      </div>
    </div>

    <!-- Remove button -->
    <UButton
      v-if="currentAvatar && !isBusy"
      variant="link"
      color="error"
      size="xs"
      icon="i-lucide-trash-2"
      @click="removeAvatar"
    >
      Remove
    </UButton>

    <!-- Hidden file input -->
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      class="hidden"
      @change="onFileSelected"
    >

    <!-- Cropper modal -->
    <AdminAvatarCropperModal
      v-model:open="cropperOpen"
      :image-file="pendingFile"
      @confirm="onCropConfirm"
    />
  </div>
</template>
