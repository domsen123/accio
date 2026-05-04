<script setup lang="ts">
definePageMeta({
  layout: 'default',
})

useSeoMeta({
  title: 'Access Denied',
})
</script>

<template>
  <div class="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
    <UIcon name="i-lucide-shield-x" class="w-16 h-16 text-error mb-4" />
    <h1 class="text-3xl font-bold mb-2">
      Access Denied
    </h1>
    <p class="text-muted mb-6 max-w-md">
      You do not have permission to access the admin area.
    </p>
    <UButton :to="ROUTES.start" color="primary">
      Go to Home
    </UButton>
  </div>
</template>
