<script setup lang="ts">
import type { OrganisationInvitation } from '~/features/organisation-invitations'
import type { OrganisationMember } from '~/features/organisation-members'
import {
  useAdminOrganisationInvitations,
  useResendOrganisationInvitation,
  useRevokeOrganisationInvitation,
} from '~/features/organisation-invitations'
import OrganisationInvitationsList from '~/features/organisation-invitations/components/OrganisationInvitationsList.vue'
import {
  useAdminOrganisationMembers,
  useInviteOrganisationMember,
  useOrganisationRoles,
  useRemoveOrganisationMember,
  useUpdateOrganisationMemberRole,
} from '~/features/organisation-members'
import OrganisationMemberInviteModal from '~/features/organisation-members/components/OrganisationMemberInviteModal.vue'
import OrganisationMembersList from '~/features/organisation-members/components/OrganisationMembersList.vue'

const route = useRoute()
const toast = useToast()

const organisationId = computed(() => route.params.id as string)
const { organisation } = useAdminOrganisation(organisationId)

// Fetch members
const { members, total, status: membersStatus, error: membersError, refresh } = useAdminOrganisationMembers(organisationId)

// Fetch roles
const { roles } = useOrganisationRoles(organisationId)

// Fetch invitations
const { invitations, status: invitationsStatus, refresh: refreshInvitations } = useAdminOrganisationInvitations(organisationId)

// Mutations
const { mutateAsync: updateRole, asyncStatus: updateStatus } = useUpdateOrganisationMemberRole()
const { mutateAsync: removeMember } = useRemoveOrganisationMember()
const { mutateAsync: inviteMember, asyncStatus: inviteStatus } = useInviteOrganisationMember()
const { mutateAsync: resendInvitation } = useResendOrganisationInvitation()
const { mutateAsync: revokeInvitation } = useRevokeOrganisationInvitation()

const isLoading = computed(() => membersStatus.value === 'pending')
const isUpdating = computed(() => updateStatus.value === 'loading')
const isInviting = computed(() => inviteStatus.value === 'loading')
const isInvitationsLoading = computed(() => invitationsStatus.value === 'pending')

// Invite modal state
const isInviteModalOpen = ref(false)

useSeoMeta({
  title: () => organisation.value
    ? `Members - ${organisation.value.name} - Admin`
    : 'Members - Admin',
})

// Handlers
const handleUpdateRole = async (member: OrganisationMember, roleId: string) => {
  try {
    await updateRole({
      organisationId: organisationId.value,
      userId: member.userId,
      data: { roleId },
    })
    toast.add({
      title: 'Role updated',
      description: `${member.user.name || member.user.email}'s role has been updated.`,
      icon: 'i-lucide-check',
      color: 'success',
    })
  }
  catch (err) {
    const message = (err as Error).message || 'Failed to update role'
    toast.add({
      title: 'Error',
      description: message,
      icon: 'i-lucide-alert-circle',
      color: 'error',
    })
  }
}

const handleRemoveMember = async (member: OrganisationMember) => {
  try {
    await removeMember({
      organisationId: organisationId.value,
      userId: member.userId,
    })
    toast.add({
      title: 'Member removed',
      description: `${member.user.name || member.user.email} has been removed from the organisation.`,
      icon: 'i-lucide-check',
      color: 'success',
    })
  }
  catch (err) {
    const message = (err as Error).message || 'Failed to remove member'
    toast.add({
      title: 'Error',
      description: message,
      icon: 'i-lucide-alert-circle',
      color: 'error',
    })
  }
}

const handleInvite = async (data: { email: string, roleId: string, deliveryMethod: 'email' | 'link' }) => {
  try {
    const result = await inviteMember({
      organisationId: organisationId.value,
      data,
    })
    isInviteModalOpen.value = false

    if (result.invited && result.invitationLink) {
      try {
        await navigator.clipboard.writeText(result.invitationLink)
        toast.add({
          title: 'Invitation link copied',
          description: `Invitation for ${data.email} has been copied to clipboard.`,
          icon: 'i-lucide-link',
          color: 'success',
        })
      }
      catch {
        toast.add({
          title: 'Invitation link created',
          description: result.invitationLink,
          icon: 'i-lucide-link',
          color: 'success',
        })
      }
      refreshInvitations()
    }
    else if (result.invited) {
      toast.add({
        title: 'Invitation sent',
        description: `An invitation has been sent to ${data.email}.`,
        icon: 'i-lucide-mail',
        color: 'success',
      })
      refreshInvitations()
    }
    else {
      toast.add({
        title: 'Member added',
        description: `${result.member?.user.name || data.email} has been added to the organisation.`,
        icon: 'i-lucide-check',
        color: 'success',
      })
    }
  }
  catch (err) {
    const message = (err as Error).message || 'Failed to invite member'
    toast.add({
      title: 'Error',
      description: message,
      icon: 'i-lucide-alert-circle',
      color: 'error',
    })
  }
}

const handleResendInvitation = async (invitation: OrganisationInvitation) => {
  try {
    await resendInvitation({
      organisationId: organisationId.value,
      invitationId: invitation.id,
    })
    toast.add({
      title: 'Invitation resent',
      description: `Invitation email has been resent to ${invitation.email}.`,
      icon: 'i-lucide-mail',
      color: 'success',
    })
  }
  catch (err) {
    const message = (err as Error).message || 'Failed to resend invitation'
    toast.add({
      title: 'Error',
      description: message,
      icon: 'i-lucide-alert-circle',
      color: 'error',
    })
  }
}

const handleRevokeInvitation = async (invitation: OrganisationInvitation) => {
  try {
    await revokeInvitation({
      organisationId: organisationId.value,
      invitationId: invitation.id,
    })
    toast.add({
      title: 'Invitation revoked',
      description: `Invitation to ${invitation.email} has been revoked.`,
      icon: 'i-lucide-check',
      color: 'success',
    })
  }
  catch (err) {
    const message = (err as Error).message || 'Failed to revoke invitation'
    toast.add({
      title: 'Error',
      description: message,
      icon: 'i-lucide-alert-circle',
      color: 'error',
    })
  }
}

const handleCopyInvitationLink = async (invitation: OrganisationInvitation) => {
  try {
    await navigator.clipboard.writeText(invitation.acceptLink)
    toast.add({
      title: 'Invitation link copied',
      description: `Invitation link for ${invitation.email} has been copied to clipboard.`,
      icon: 'i-lucide-link',
      color: 'success',
    })
  }
  catch {
    toast.add({
      title: 'Invitation link',
      description: invitation.acceptLink,
      icon: 'i-lucide-link',
      color: 'success',
    })
  }
}

const handleRefresh = () => {
  refresh()
  refreshInvitations()
}
</script>

<template>
  <div class="py-6 px-6">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">
          Members
        </h1>
        <p class="text-muted">
          {{ total }} member{{ total !== 1 ? 's' : '' }} in this organisation
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          :loading="isLoading"
          @click="handleRefresh()"
        />
        <UButton
          icon="i-lucide-user-plus"
          label="Invite"
          @click="isInviteModalOpen = true"
        />
      </div>
    </div>

    <UAlert
      v-if="membersError"
      color="error"
      title="Failed to load data"
      :description="membersError.message"
      icon="i-lucide-alert-circle"
      class="mb-4"
    />

    <div v-if="isLoading" class="flex justify-center py-12">
      <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-muted" />
    </div>

    <div v-else class="space-y-6">
      <OrganisationMembersList
        :members="members"
        :roles="roles"
        :is-updating="isUpdating"
        @update:role="handleUpdateRole"
        @remove="handleRemoveMember"
      />

      <OrganisationInvitationsList
        :invitations="invitations"
        :is-loading="isInvitationsLoading"
        @resend="handleResendInvitation"
        @revoke="handleRevokeInvitation"
        @copy-link="handleCopyInvitationLink"
      />
    </div>
  </div>

  <OrganisationMemberInviteModal
    v-model:open="isInviteModalOpen"
    :roles="roles"
    :is-loading="isInviting"
    @submit="handleInvite"
  />
</template>
