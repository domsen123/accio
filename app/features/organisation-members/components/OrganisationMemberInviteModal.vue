<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { OrganisationRole } from '../types/organisation-members.types'
import * as z from 'zod'

const props = defineProps<{
  roles: OrganisationRole[]
  isLoading?: boolean
}>()

const emit = defineEmits<{
  submit: [data: { email: string, roleId: string, deliveryMethod: 'email' | 'link' }]
  cancel: []
}>()

const isOpen = defineModel<boolean>('open', { default: false })

const schema = z.object({
  email: z.string().trim().email('Valid email is required'),
  roleId: z.string().min(1, 'Role is required'),
  deliveryMethod: z.enum(['email', 'link']),
})

type Schema = z.output<typeof schema>

// Find default role
const defaultRole = computed(() =>
  props.roles.find(r => r.isDefault) || props.roles[0],
)

const state = reactive<Schema>({
  email: '',
  roleId: '',
  deliveryMethod: 'email',
})

// Set default role when roles load
watch(() => defaultRole.value, (role) => {
  if (role && !state.roleId) {
    state.roleId = role.id
  }
}, { immediate: true })

// Reset form when modal opens
watch(isOpen, (open) => {
  if (open) {
    state.email = ''
    state.roleId = defaultRole.value?.id ?? ''
    state.deliveryMethod = 'email'
  }
})

const roleOptions = computed(() =>
  props.roles.map(role => ({
    label: role.name,
    value: role.id,
  })),
)

const deliveryMethodItems = [
  { label: 'Send email', description: 'Send an invitation email to the user', value: 'email' },
  { label: 'Copy invitation link', description: 'Generate a link to share manually', value: 'link' },
]

const submitLabel = computed(() => state.deliveryMethod === 'link' ? 'Create Link' : 'Send Invite')
const submitIcon = computed(() => state.deliveryMethod === 'link' ? 'i-lucide-link' : 'i-lucide-send')

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
              <UIcon name="i-lucide-user-plus" class="size-5 text-primary" />
            </div>
            <div>
              <h3 class="text-base font-semibold text-highlighted">
                Invite Member
              </h3>
              <p class="text-sm text-muted">
                Invite a user to join this organisation
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
            label="Email Address"
            name="email"
            required
          >
            <template #description>
              <span class="text-dimmed">Enter the email address of the person to invite</span>
            </template>
            <UInput
              v-model="state.email"
              type="email"
              placeholder="user@example.com"
              icon="i-lucide-mail"
              autofocus
            />
          </UFormField>

          <UFormField
            label="Role"
            name="roleId"
            required
          >
            <template #description>
              <span class="text-dimmed">Select the role for the new member</span>
            </template>
            <USelect
              v-model="state.roleId"
              :items="roleOptions"
              placeholder="Select a role"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Delivery Method"
            name="deliveryMethod"
          >
            <URadioGroup
              v-model="state.deliveryMethod"
              :items="deliveryMethodItems"
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
                <UIcon :name="submitIcon" class="size-4" />
              </template>
              {{ submitLabel }}
            </UButton>
          </div>
        </UForm>
      </UCard>
    </template>
  </UModal>
</template>
