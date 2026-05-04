<script setup lang="ts">
import { useSessions } from '../composables/useSessions'
import { useLogoutOtherSessions, useRevokeSession } from '../composables/useSessionsMutations'
import { getDeviceIcon, parseUserAgent } from '../utils/parseUserAgent'

const { sessions, isLoading, error } = useSessions()
const { mutateAsync: logoutOtherSessions, asyncStatus: logoutAllStatus } = useLogoutOtherSessions()
const { mutateAsync: revokeSession, asyncStatus: revokeStatus, variables: revokingSessionId } = useRevokeSession()

const isLoggingOutAll = computed(() => logoutAllStatus.value === 'loading')
const isRevoking = computed(() => revokeStatus.value === 'loading')

const otherSessionsCount = computed(() =>
  sessions.value.filter(s => !s.isCurrent).length,
)

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const onLogoutAll = async () => {
  try {
    await logoutOtherSessions()
  }
  catch {
    // Error handling
  }
}

const onRevokeSession = async (sessionId: string) => {
  try {
    await revokeSession(sessionId)
  }
  catch {
    // Error handling
  }
}
</script>

<template>
  <UPageCard variant="subtle">
    <template #header>
      <div class="flex justify-between items-center">
        <div>
          <h3 class="text-lg font-medium text-(--ui-text-highlighted)">
            Active Sessions
          </h3>
          <p class="text-sm text-(--ui-text-muted) mt-0.5">
            Manage your active sessions across devices. You can log out of other sessions if you notice any suspicious activity.
          </p>
        </div>
        <UButton
          v-if="otherSessionsCount > 0"
          variant="soft"
          color="error"
          :loading="isLoggingOutAll"
          @click="onLogoutAll"
        >
          Log out other devices
        </UButton>
      </div>
    </template>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-8">
      <UIcon name="i-lucide-loader-2" class="w-6 h-6 animate-spin text-(--ui-text-muted)" />
    </div>

    <!-- Error State -->
    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-alert-triangle"
      title="Failed to load sessions"
      :description="(error as any)?.message || 'An error occurred'"
    />

    <!-- Sessions List -->
    <div v-else class="divide-y divide-(--ui-border)">
      <div
        v-for="session in sessions"
        :key="session.id"
        class="flex items-start gap-4 py-4 first:pt-0 last:pb-0"
      >
        <!-- Device Icon -->
        <div class="flex-shrink-0 w-10 h-10 rounded-lg bg-(--ui-bg-elevated) flex items-center justify-center">
          <UIcon
            :name="getDeviceIcon(parseUserAgent(session.userAgent).device)"
            class="w-5 h-5 text-(--ui-text-muted)"
          />
        </div>

        <!-- Session Info -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-medium text-(--ui-text-highlighted)">
              {{ parseUserAgent(session.userAgent).browser }} on {{ parseUserAgent(session.userAgent).os }}
            </span>
            <UBadge
              v-if="session.isCurrent"
              color="success"
              variant="subtle"
              size="xs"
            >
              Current
            </UBadge>
          </div>

          <div class="text-sm text-(--ui-text-muted) mt-1 space-y-0.5">
            <p v-if="session.ipAddress">
              IP: {{ session.ipAddress }}
            </p>
            <p>
              Created: {{ formatDate(session.createdAt) }}
            </p>
          </div>
        </div>

        <!-- Actions -->
        <div v-if="!session.isCurrent" class="flex-shrink-0">
          <UButton
            variant="ghost"
            color="error"
            size="sm"
            :loading="isRevoking && revokingSessionId === session.id"
            @click="onRevokeSession(session.id)"
          >
            Revoke
          </UButton>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="sessions.length === 0" class="text-center py-8">
        <UIcon name="i-lucide-monitor-check" class="w-12 h-12 mx-auto text-(--ui-text-muted) mb-3" />
        <p class="text-(--ui-text-muted)">
          No active sessions found
        </p>
      </div>
    </div>
  </UPageCard>
</template>
