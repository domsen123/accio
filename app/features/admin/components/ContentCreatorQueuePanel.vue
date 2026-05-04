<script setup lang="ts">
const toast = useToast()

const { queue, isLoading } = useContentCreatorQueue()
const { mutateAsync: processQueue, asyncStatus: processStatus } = useProcessContentCreatorQueue()

const isProcessing = computed(() => processStatus.value === 'loading')

const onProcess = async () => {
  try {
    const result = await processQueue()
    if (result.processed) {
      toast.add({ title: 'Queue item processed', description: 'A draft blog post has been created.', color: 'success' })
    }
    else {
      toast.add({ title: 'No items to process', description: result.message, color: 'neutral' })
    }
  }
  catch (err: unknown) {
    const error = err as { data?: { statusMessage?: string }, message?: string }
    toast.add({
      title: 'Queue processing failed',
      description: error.data?.statusMessage || error.message || 'An error occurred',
      color: 'error',
    })
  }
}

const formatDate = (dateString: string | null) => {
  if (!dateString)
    return '-'
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="space-y-4">
    <UPageCard variant="subtle">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-semibold text-highlighted">
            Production Queue
          </h3>
          <p class="text-sm text-muted mt-1">
            Items processed automatically based on your production schedule.
          </p>
        </div>
        <UButton
          variant="outline"
          icon="i-lucide-play"
          :loading="isProcessing"
          :disabled="queue.length === 0"
          @click="onProcess"
        >
          Process Next
        </UButton>
      </div>
    </UPageCard>

    <div v-if="isLoading" class="flex items-center justify-center py-8">
      <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
    </div>

    <UPageCard v-else-if="queue.length === 0" variant="subtle">
      <div class="text-center py-4">
        <UIcon name="i-lucide-inbox" class="size-10 text-muted mx-auto mb-2" />
        <p class="text-sm text-muted">
          No items in the production queue. Queue clusters from the Clusters tab to start generating content.
        </p>
      </div>
    </UPageCard>

    <div v-else class="space-y-3">
      <UPageCard v-for="item in queue" :key="item.id" variant="subtle">
        <div class="flex items-center gap-4">
          <div class="flex items-center justify-center size-10 rounded-lg bg-primary/10 shrink-0">
            <UIcon name="i-lucide-clock" class="size-5 text-primary" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-highlighted truncate">
              {{ item.title }}
            </p>
            <div class="flex items-center gap-1.5 text-xs text-muted mt-1">
              <span v-if="item.pillar">{{ item.pillar.name }}</span>
              <span v-if="item.pillar" class="text-muted/50">&middot;</span>
              <span>{{ formatDate(item.scheduledFor) }}</span>
              <span class="text-muted/50">&middot;</span>
              <span>Priority: {{ item.priority }}</span>
            </div>
          </div>
          <UBadge color="warning" variant="subtle" size="xs">
            Queued
          </UBadge>
        </div>
      </UPageCard>
    </div>
  </div>
</template>
