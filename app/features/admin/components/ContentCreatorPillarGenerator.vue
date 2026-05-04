<script setup lang="ts">
import * as z from 'zod'

const toast = useToast()

const { mutateAsync: generatePillars, asyncStatus: generateStatus } = useGenerateContentCreatorPillars()

const isGenerating = computed(() => generateStatus.value === 'loading')

const schema = z.object({
  seedTopic: z.string().trim().min(1, 'Seed topic is required').max(200),
})

const state = reactive({
  seedTopic: '',
})

const onSubmit = async () => {
  try {
    const data = schema.parse(state)
    await generatePillars(data.seedTopic)
    toast.add({ title: 'Pillars generated', color: 'success' })
    state.seedTopic = ''
  }
  catch (err: unknown) {
    const error = err as { data?: { statusMessage?: string }, message?: string }
    toast.add({
      title: 'Failed to generate pillars',
      description: error.data?.statusMessage || error.message || 'An error occurred',
      color: 'error',
    })
  }
}
</script>

<template>
  <UPageCard title="Generate Pillars" icon="i-lucide-sparkles" variant="subtle">
    <form class="flex gap-3" @submit.prevent="onSubmit">
      <UInput
        v-model="state.seedTopic"
        placeholder="Enter a seed topic, e.g. 'Kubernetes best practices'"
        class="flex-1"
        :disabled="isGenerating"
      />
      <UButton
        type="submit"
        :loading="isGenerating"
        :disabled="!state.seedTopic.trim()"
        icon="i-lucide-sparkles"
      >
        Generate
      </UButton>
    </form>
    <p v-if="isGenerating" class="text-sm text-muted mt-3">
      Generating content pillars with AI... This may take a moment.
    </p>
  </UPageCard>
</template>
