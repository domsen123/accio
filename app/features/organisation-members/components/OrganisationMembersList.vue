<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { OrganisationMember, OrganisationRole } from '../types/organisation-members.types'
import OrganisationRoleSelect from './OrganisationRoleSelect.vue'

const props = defineProps<{
  members: OrganisationMember[]
  roles: OrganisationRole[]
  isUpdating?: boolean
}>()

const emit = defineEmits<{
  'update:role': [member: OrganisationMember, roleId: string]
  'remove': [member: OrganisationMember]
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

const handleRoleChange = (member: OrganisationMember, roleId: string) => {
  if (roleId !== member.role?.id) {
    emit('update:role', member, roleId)
  }
}

const getActionsMenu = (member: OrganisationMember): DropdownMenuItem[] => [
  {
    label: 'Remove member',
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

    <ul v-if="filteredMembers.length > 0" role="list" class="divide-y divide-default">
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
          <OrganisationRoleSelect
            :model-value="member.role?.id ?? ''"
            :roles="roles"
            :disabled="isUpdating"
            @update:model-value="handleRoleChange(member, $event)"
          />

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
        No members in this organisation
      </p>
    </div>
  </UPageCard>
</template>
