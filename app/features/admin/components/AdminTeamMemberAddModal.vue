<script setup lang="ts">
import type { AdminTeamMemberUser } from '../types/admin.types'

const props = defineProps<{
  eligibleMembers: AdminTeamMemberUser[]
  isLoading?: boolean
}>()

const emit = defineEmits<{
  submit: [data: { userId: string }]
}>()

const open = defineModel<boolean>('open', { default: false })

const selectedUserId = ref<string>('')
const search = ref('')

const filteredMembers = computed(() => {
  if (!search.value.trim()) {
    return props.eligibleMembers
  }
  const query = search.value.toLowerCase()
  return props.eligibleMembers.filter(member =>
    member.name?.toLowerCase().includes(query)
    || member.email.toLowerCase().includes(query),
  )
})

const selectedUser = computed(() =>
  props.eligibleMembers.find(m => m.id === selectedUserId.value),
)

const handleSubmit = () => {
  if (!selectedUserId.value)
    return
  emit('submit', { userId: selectedUserId.value })
  selectedUserId.value = ''
  search.value = ''
}

const handleCancel = () => {
  open.value = false
  selectedUserId.value = ''
  search.value = ''
}

watch(open, (isOpen) => {
  if (!isOpen) {
    selectedUserId.value = ''
    search.value = ''
  }
})
</script>

<template>
  <UModal v-model:open="open" title="Add Team Member" :ui="{ footer: 'justify-end' }">
    <template #body>
      <div class="space-y-4">
        <UFormField label="Select a member">
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Search organisation members..."
            class="mb-2"
          />

          <div v-if="filteredMembers.length > 0" class="border border-default rounded-md max-h-64 overflow-y-auto">
            <button
              v-for="member in filteredMembers"
              :key="member.id"
              type="button"
              class="w-full flex items-center gap-3 p-3 hover:bg-elevated transition-colors text-left"
              :class="{ 'bg-primary/10': selectedUserId === member.id }"
              @click="selectedUserId = member.id"
            >
              <UAvatar
                :alt="member.name || member.email"
                size="sm"
              />
              <div class="text-sm min-w-0">
                <p class="text-highlighted font-medium truncate">
                  {{ member.name || 'No name' }}
                </p>
                <p class="text-muted truncate text-xs">
                  {{ member.email }}
                </p>
              </div>
              <UIcon
                v-if="selectedUserId === member.id"
                name="i-lucide-check"
                class="ml-auto text-primary size-5"
              />
            </button>
          </div>

          <div v-else class="border border-default rounded-md p-4 text-center text-muted">
            <UIcon name="i-lucide-users" class="size-6 mx-auto mb-2 opacity-50" />
            <p v-if="search">
              No members found matching "{{ search }}"
            </p>
            <p v-else>
              No eligible members to add
            </p>
          </div>
        </UFormField>

        <div v-if="selectedUser" class="p-3 bg-elevated rounded-md">
          <p class="text-sm text-muted mb-1">
            Selected member:
          </p>
          <div class="flex items-center gap-2">
            <UAvatar :alt="selectedUser.name || selectedUser.email" size="sm" />
            <span class="font-medium">{{ selectedUser.name || selectedUser.email }}</span>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <UButton
        color="neutral"
        variant="outline"
        label="Cancel"
        @click="handleCancel"
      />
      <UButton
        label="Add Member"
        :disabled="!selectedUserId"
        :loading="isLoading"
        @click="handleSubmit"
      />
    </template>
  </UModal>
</template>
