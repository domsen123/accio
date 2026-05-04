<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { AdminTeamMember } from '../types/admin.types'

const props = defineProps<{
  members: AdminTeamMember[]
  isLoading?: boolean
}>()

const emit = defineEmits<{
  remove: [member: AdminTeamMember]
}>()

const search = ref('')

const filteredMembers = computed(() => {
  if (!search.value.trim()) {
    return props.members
  }
  const query = search.value.toLowerCase()
  return props.members.filter(member =>
    member.user.name?.toLowerCase().includes(query)
    || member.user.email?.toLowerCase().includes(query),
  )
})

const getActionsMenu = (member: AdminTeamMember): DropdownMenuItem[] => [
  {
    label: 'Remove from team',
    icon: 'i-lucide-user-minus',
    color: 'error' as const,
    onSelect: () => emit('remove', member),
  },
]
</script>

<template>
  <UPageCard
    variant="subtle"
    :ui="{
      container: 'p-0 sm:p-0 gap-y-0',
      wrapper: 'items-stretch',
      header: 'p-4 mb-0 border-b border-default',
    }"
  >
    <template #header>
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Search members..."
        class="w-full"
      />
    </template>

    <div v-if="isLoading" class="py-12 flex justify-center">
      <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-muted" />
    </div>

    <ul v-else-if="filteredMembers.length > 0" role="list" class="divide-y divide-default">
      <li
        v-for="member in filteredMembers"
        :key="member.id"
        class="flex items-center justify-between gap-3 py-3 px-4 sm:px-6"
      >
        <div class="flex items-center gap-3 min-w-0">
          <UAvatar
            :alt="member.user.name || member.user.email"
            size="md"
          />
          <div class="text-sm min-w-0">
            <p class="text-highlighted font-medium truncate">
              {{ member.user.name || 'No name' }}
            </p>
            <p class="text-muted truncate">
              {{ member.user.email }}
            </p>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <UBadge v-if="member.role?.name === 'Lead'" color="primary" variant="subtle">
            Lead
          </UBadge>

          <UDropdownMenu :items="getActionsMenu(member)" :content="{ align: 'end' }">
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
            />
          </UDropdownMenu>
        </div>
      </li>
    </ul>

    <div v-else class="py-12 text-center text-muted">
      <UIcon name="i-lucide-users" class="size-8 mx-auto mb-2 opacity-50" />
      <p v-if="search">
        No members found matching "{{ search }}"
      </p>
      <p v-else>
        No members in this team
      </p>
    </div>
  </UPageCard>
</template>
