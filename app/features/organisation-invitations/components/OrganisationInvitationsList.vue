<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { OrganisationInvitation } from '../api/organisation-invitations.api'

defineProps<{
  invitations: OrganisationInvitation[]
  isLoading?: boolean
}>()

const emit = defineEmits<{
  resend: [invitation: OrganisationInvitation]
  revoke: [invitation: OrganisationInvitation]
  copyLink: [invitation: OrganisationInvitation]
}>()

const getExpiryText = (invitation: OrganisationInvitation): string => {
  if (invitation.isExpired) {
    return 'Expired'
  }

  const expiresAt = new Date(invitation.expiresAt)
  const now = new Date()
  const diffMs = expiresAt.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return 'Expires today'
  }
  else if (diffDays === 1) {
    return 'Expires tomorrow'
  }
  else {
    return `Expires in ${diffDays} days`
  }
}

const getActionsMenu = (invitation: OrganisationInvitation): DropdownMenuItem[] => {
  const items: DropdownMenuItem[] = []

  if (!invitation.isExpired) {
    items.push({
      label: 'Copy invitation link',
      icon: 'i-lucide-link',
      onSelect: () => emit('copyLink', invitation),
    })
    items.push({
      label: 'Resend invitation',
      icon: 'i-lucide-mail',
      onSelect: () => emit('resend', invitation),
    })
  }

  items.push({
    label: 'Revoke invitation',
    icon: 'i-lucide-x',
    color: 'error' as const,
    onSelect: () => emit('revoke', invitation),
  })

  return items
}
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
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold">
          Pending Invitations
        </h3>
        <span class="text-sm text-muted">
          {{ invitations.length }} invitation{{ invitations.length !== 1 ? 's' : '' }}
        </span>
      </div>
    </template>

    <div v-if="isLoading" class="flex justify-center py-8">
      <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
    </div>

    <ul v-else-if="invitations.length > 0" role="list" class="divide-y divide-default">
      <li
        v-for="invitation in invitations"
        :key="invitation.id"
        class="flex items-center justify-between gap-3 py-3 px-4 sm:px-6"
        :class="{ 'opacity-60': invitation.isExpired }"
      >
        <div class="flex items-center gap-3 min-w-0">
          <UAvatar
            icon="i-lucide-mail"
            size="md"
            :ui="{ icon: 'text-muted' }"
          />
          <div class="text-sm min-w-0">
            <p class="text-highlighted font-medium truncate" :class="{ 'line-through': invitation.isExpired }">
              {{ invitation.email }}
            </p>
            <div class="flex items-center gap-2 text-muted">
              <span v-if="invitation.role">{{ invitation.role.name }}</span>
              <span v-if="invitation.invitedBy?.name" class="hidden sm:inline">
                &middot; Invited by {{ invitation.invitedBy.name }}
              </span>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <UBadge
            :color="invitation.isExpired ? 'error' : 'neutral'"
            variant="subtle"
            size="sm"
          >
            {{ getExpiryText(invitation) }}
          </UBadge>

          <UDropdownMenu :items="getActionsMenu(invitation)" :content="{ align: 'end' }">
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
      <UIcon name="i-lucide-mail-check" class="size-8 mx-auto mb-2 opacity-50" />
      <p>No pending invitations</p>
    </div>
  </UPageCard>
</template>
