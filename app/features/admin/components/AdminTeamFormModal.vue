<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { AdminTeam } from '../types/admin.types'
import * as z from 'zod'

const props = defineProps<{
  team?: AdminTeam | null
  isLoading?: boolean
}>()

const emit = defineEmits<{
  submit: [data: { name: string }]
  cancel: []
}>()

const isOpen = defineModel<boolean>('open', { default: false })

const isEditing = computed(() => !!props.team)

const schema = z.object({
  name: z.string().trim().min(1, 'Team name is required').max(100, 'Team name must be 100 characters or less'),
})

type Schema = z.output<typeof schema>

const state = reactive<Schema>({
  name: '',
})

// Reset form when modal opens or team changes
watch([isOpen, () => props.team], ([open, team]) => {
  if (open) {
    state.name = team?.name ?? ''
  }
}, { immediate: true })

const onSubmit = (event: FormSubmitEvent<Schema>) => {
  emit('submit', event.data)
}

const onCancel = () => {
  isOpen.value = false
  emit('cancel')
}
</script>

<template>
  <UModal v-model:open="isOpen">
    <template #content>
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center size-10 rounded-lg bg-primary/10">
              <UIcon name="i-lucide-users-round" class="size-5 text-primary" />
            </div>
            <div>
              <h3 class="text-base font-semibold text-highlighted">
                {{ isEditing ? 'Edit Team' : 'Create Team' }}
              </h3>
              <p class="text-sm text-muted">
                {{ isEditing ? 'Update the team details' : 'Add a new team to this organisation' }}
              </p>
            </div>
          </div>
        </template>

        <UForm
          :schema="schema"
          :state="state"
          class="space-y-4"
          @submit="onSubmit"
        >
          <UFormField
            label="Team Name"
            name="name"
            required
          >
            <template #description>
              <span class="text-dimmed">Enter a name for the team</span>
            </template>
            <UInput
              v-model="state.name"
              placeholder="e.g. Engineering, Marketing"
              icon="i-lucide-type"
              autofocus
            />
          </UFormField>

          <div class="flex items-center justify-end gap-3 pt-4">
            <UButton
              variant="ghost"
              color="neutral"
              :disabled="isLoading"
              @click="onCancel"
            >
              Cancel
            </UButton>
            <UButton
              type="submit"
              :loading="isLoading"
            >
              <template v-if="!isLoading" #leading>
                <UIcon :name="isEditing ? 'i-lucide-check' : 'i-lucide-plus'" class="size-4" />
              </template>
              {{ isEditing ? 'Update Team' : 'Create Team' }}
            </UButton>
          </div>
        </UForm>
      </UCard>
    </template>
  </UModal>
</template>
