<script setup lang="ts">
import type { AdminTeamMember } from '~/features/admin'
import {
  useAddTeamMember,
  useAdminTeam,
  useAdminTeamEligibleMembers,
  useAdminTeamMembers,
  useRemoveTeamMember,
} from '~/features/admin'
import AdminTeamMemberAddModal from '~/features/admin/components/AdminTeamMemberAddModal.vue'
import AdminTeamMemberList from '~/features/admin/components/AdminTeamMemberList.vue'

const route = useRoute()
const toast = useToast()

const teamId = computed(() => route.params.id as string)
const { team } = useAdminTeam(teamId)

// Fetch team members
const { members, total, status: membersStatus, error: membersError, refresh } = useAdminTeamMembers(teamId)

// Fetch eligible members
const { members: eligibleMembers } = useAdminTeamEligibleMembers(teamId)

// Mutations
const { mutateAsync: addMember, asyncStatus: addStatus } = useAddTeamMember()
const { mutateAsync: removeMember } = useRemoveTeamMember()

const isLoading = computed(() => membersStatus.value === 'pending')
const isAdding = computed(() => addStatus.value === 'loading')

// Modal state
const isAddModalOpen = ref(false)

useSeoMeta({
  title: () => team.value
    ? `Members - ${team.value.name} - Admin`
    : 'Team Members - Admin',
})

const handleAddMember = async (data: { userId: string }) => {
  try {
    await addMember({
      teamId: teamId.value,
      data,
    })
    isAddModalOpen.value = false
    toast.add({
      title: 'Member added',
      description: 'The member has been added to the team.',
      icon: 'i-lucide-check',
      color: 'success',
    })
  }
  catch (err) {
    const message = (err as Error).message || 'Failed to add member'
    toast.add({
      title: 'Error',
      description: message,
      icon: 'i-lucide-alert-circle',
      color: 'error',
    })
  }
}

const handleRemoveMember = async (member: AdminTeamMember) => {
  try {
    await removeMember({
      teamId: teamId.value,
      userId: member.userId,
    })
    toast.add({
      title: 'Member removed',
      description: `${member.user.name || member.user.email} has been removed from the team.`,
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
</script>

<template>
  <div class="py-6 px-6">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">
          Members
        </h1>
        <p class="text-muted">
          {{ total }} member{{ total !== 1 ? 's' : '' }} in this team
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          :loading="isLoading"
          @click="refresh()"
        />
        <UButton
          icon="i-lucide-user-plus"
          label="Add Member"
          :disabled="eligibleMembers.length === 0"
          @click="isAddModalOpen = true"
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

    <AdminTeamMemberList
      :members="members"
      :is-loading="isLoading"
      @remove="handleRemoveMember"
    />
  </div>

  <AdminTeamMemberAddModal
    v-model:open="isAddModalOpen"
    :eligible-members="eligibleMembers"
    :is-loading="isAdding"
    @submit="handleAddMember"
  />
</template>
