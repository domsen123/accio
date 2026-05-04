<script lang="ts" setup>
definePageMeta({
  layout: 'dashboard',
})

const route = useRoute()
watch(() => route.hash, (hash) => {
  if (hash) {
    nextTick(() => {
      document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth' })
    })
  }
}, { immediate: true })
</script>

<template>
  <NuxtPage />
</template>
