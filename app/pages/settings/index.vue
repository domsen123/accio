<script setup lang="ts">
import { useProfile } from '~/features/profile'
import ProfileForm from '~/features/profile/components/ProfileForm.vue'

const toast = useToast()

const { profile, status, error } = useProfile()

const isLoading = computed(() => status.value === 'pending')

useSeoMeta({
  title: 'Profile - Settings',
})

const onSuccess = () => {
  toast.add({
    title: 'Profile updated',
    description: 'Your profile has been updated successfully.',
    icon: 'i-lucide-check',
    color: 'success',
  })
}
</script>

<template>
  <div>
    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <UIcon name="i-lucide-loader-2" class="animate-spin size-8 text-muted" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      title="Failed to load profile"
      :description="error.message"
      icon="i-lucide-alert-circle"
    />

    <ProfileForm
      v-else-if="profile"
      :profile="profile"
      @success="onSuccess"
    />
  </div>
</template>
