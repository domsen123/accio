<script setup lang="ts">
import type { ContentCreatorPillar } from '../types/admin.types'

const props = defineProps<{
  pillar: ContentCreatorPillar
}>()

const emit = defineEmits<{
  confirm: [id: string]
  reject: [id: string]
  delete: [id: string]
  expand: [id: string]
}>()

const statusColor = computed(() => {
  switch (props.pillar.status) {
    case 'confirmed': return 'success'
    case 'rejected': return 'error'
    default: return 'neutral'
  }
})

const statusLabel = computed(() => {
  switch (props.pillar.status) {
    case 'confirmed': return 'Confirmed'
    case 'rejected': return 'Rejected'
    default: return 'Pending'
  }
})
</script>

<template>
  <UPageCard variant="subtle">
    <div class="flex items-start gap-4">
      <div class="flex items-center justify-center size-10 rounded-lg bg-primary/10 shrink-0">
        <UIcon name="i-lucide-compass" class="size-5 text-primary" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 mb-1">
          <h4 class="text-sm font-semibold text-highlighted truncate">
            {{ pillar.name }}
          </h4>
          <UBadge :color="statusColor" variant="subtle" size="xs">
            {{ statusLabel }}
          </UBadge>
        </div>
        <p v-if="pillar.description" class="text-sm text-muted line-clamp-2 mb-2">
          {{ pillar.description }}
        </p>
        <div class="flex items-center gap-1.5 text-xs text-muted">
          <span>{{ pillar.seedTopic }}</span>
          <span v-if="pillar.category" class="text-muted/50">&middot;</span>
          <span v-if="pillar.category">{{ pillar.category.name }}</span>
          <span class="text-muted/50">&middot;</span>
          <span>{{ pillar.clusterCount }} clusters</span>
        </div>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <template v-if="pillar.status === 'pending'">
          <UButton
            size="xs"
            color="success"
            variant="soft"
            icon="i-lucide-check"
            @click="emit('confirm', pillar.id)"
          >
            Confirm
          </UButton>
          <UButton
            size="xs"
            color="error"
            variant="soft"
            icon="i-lucide-x"
            @click="emit('reject', pillar.id)"
          >
            Reject
          </UButton>
        </template>
        <UButton
          v-if="pillar.status === 'confirmed'"
          size="xs"
          variant="soft"
          icon="i-lucide-layers"
          @click="emit('expand', pillar.id)"
        >
          Generate Clusters
        </UButton>
        <UButton
          size="xs"
          color="error"
          variant="ghost"
          icon="i-lucide-trash-2"
          @click="emit('delete', pillar.id)"
        />
      </div>
    </div>
  </UPageCard>
</template>
