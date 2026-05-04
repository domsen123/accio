<script lang="ts" setup>
const route = useRoute()
watch(() => route.hash, (hash) => {
  if (hash) {
    console.log('Hash changed:', hash)
    nextTick(() => {
      document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth' })
    })
  }
}, { immediate: true })
</script>

<template>
  <NuxtPage />
</template>
