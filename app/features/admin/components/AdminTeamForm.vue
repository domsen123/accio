<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { AdminTeam } from '../types/admin.types'
import { z } from 'zod'
import { useDeleteTeam, useUpdateTeam } from '../composables/useAdminTeamMutations'

const props = defineProps<{
  team: AdminTeam
}>()

const emit = defineEmits<{
  success: [team: AdminTeam]
  cancel: []
}>()

const router = useRouter()
const toast = useToast()

const NAME_MAX_LENGTH = 100

const schema = z.object({
  name: z.string().trim().min(1, 'Team name is required').max(NAME_MAX_LENGTH, `Name must be ${NAME_MAX_LENGTH} characters or less`),
})

type Schema = z.output<typeof schema>

const state = reactive<Schema>({
  name: props.team.name,
})

// Reset form when team changes
watch(() => props.team, (newTeam) => {
  state.name = newTeam.name
}, { deep: true })

// Mutations
const { mutateAsync: updateTeam, asyncStatus: updateStatus, error: updateError } = useUpdateTeam()
const { mutateAsync: deleteTeam, asyncStatus: deleteStatus, error: deleteError } = useDeleteTeam()

const isLoading = computed(() =>
  updateStatus.value === 'loading' || deleteStatus.value === 'loading',
)

const apiError = computed(() => {
  const err = (updateError.value || deleteError.value) as {
    statusCode?: number
    data?: { statusMessage?: string }
    message?: string
  } | null
  if (!err)
    return null
  return err.data?.statusMessage || err.message || 'An unexpected error occurred. Please try again.'
})

const onSubmit = async (event: FormSubmitEvent<Schema>) => {
  try {
    const result = await updateTeam({ id: props.team.id, data: event.data })
    toast.add({ title: 'Team updated', color: 'success' })
    emit('success', result.team)
  }
  catch {
    // Error is captured in refs
  }
}

const onDelete = async () => {
  try {
    await deleteTeam(props.team.id)
    toast.add({ title: 'Team deleted', color: 'success' })
    router.push(ROUTES.admin.teams)
  }
  catch {
    // Error is captured in refs
  }
}
</script>

<template>
  <UForm
    id="team-form"
    :schema="schema"
    :state="state"
    class="space-y-4"
    @submit="onSubmit"
  >
    <!-- Header Card -->
    <UPageCard
      title="Edit Team"
      description="Update the team details below."
      variant="naked"
      orientation="horizontal"
      class="mb-4"
    >
      <div class="flex gap-2 lg:ms-auto">
        <UButton
          variant="ghost"
          color="neutral"
          :disabled="isLoading"
          @click="emit('cancel')"
        >
          Cancel
        </UButton>
        <UButton
          form="team-form"
          type="submit"
          :loading="updateStatus === 'loading'"
        >
          Save Changes
        </UButton>
      </div>
    </UPageCard>

    <!-- Error Alert -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <UAlert
        v-if="apiError"
        color="error"
        variant="subtle"
        icon="i-lucide-alert-triangle"
        :title="apiError"
        class="animate-shake"
      />
    </Transition>

    <!-- Form Fields Card -->
    <UPageCard variant="subtle">
      <UFormField
        name="name"
        label="Team Name"
        description="The display name for this team."
        required
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <div class="w-full max-w-sm">
          <UInput
            v-model="state.name"
            placeholder="Engineering Team"
            :maxlength="NAME_MAX_LENGTH"
          />
        </div>
      </UFormField>
    </UPageCard>

    <!-- Danger Zone Card -->
    <UPageCard variant="subtle">
      <div class="space-y-4">
        <h3 class="text-sm font-medium text-error">
          Danger Zone
        </h3>
        <UAlert
          color="error"
          variant="subtle"
          icon="i-lucide-alert-triangle"
          title="Delete Team"
          description="Permanently delete this team. This action cannot be undone and will remove all team members."
        >
          <template #actions>
            <UButton
              color="error"
              variant="outline"
              label="Delete Team"
              icon="i-lucide-trash-2"
              :loading="deleteStatus === 'loading'"
              @click="onDelete"
            />
          </template>
        </UAlert>
      </div>
    </UPageCard>
  </UForm>
</template>

<style scoped>
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
  20%, 40%, 60%, 80% { transform: translateX(2px); }
}

.animate-shake {
  animation: shake 0.5s ease-in-out;
}
</style>
