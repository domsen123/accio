<script setup lang="ts">
import SessionsList from '~/features/auth/components/SessionsList.vue'
import ChangePasswordForm from '~/features/profile/components/ChangePasswordForm.vue'

const toast = useToast()

useSeoMeta({
  title: 'Security - Settings',
})

const onPasswordSuccess = () => {
  toast.add({
    title: 'Password updated',
    description: 'Your password has been changed successfully.',
    icon: 'i-lucide-check',
    color: 'success',
  })
}
</script>

<template>
  <div class="space-y-6">
    <ChangePasswordForm @success="onPasswordSuccess" />
    <SessionsList />
  </div>
</template>
