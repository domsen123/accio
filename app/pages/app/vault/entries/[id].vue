<script setup lang="ts">
definePageMeta({ layout: 'app', auth: true })

const route = useRoute()
const id = computed(() => (typeof route.params.id === 'string' ? route.params.id : null))
</script>

<template>
  <VaultEntryForm :entry-id="id" />
</template>
