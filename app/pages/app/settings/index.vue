<script setup lang="ts">
/**
 * Settings landing page (`/app/settings`).
 *
 * Lists every settings sub-page as a card. Cards are filtered against the
 * current user's permissions so that, e.g., the orchestrator audit log only
 * appears for users with `orchestrator:audit:view`. Server-side guards remain
 * the source of truth — this gate just hides links the user cannot use.
 */
import { usePermissions } from '~/features/permissions'

definePageMeta({
  layout: 'app',
  auth: true,
})

const { t } = useI18n()

useSeoMeta({
  title: () => t('settings.index.title'),
})

const permissions = usePermissions()

const hasOrgPerm = (perm: string) => {
  if (permissions.isGlobalAdmin.value)
    return true
  const orgPerms = permissions.data.value?.organisations ?? {}
  return Object.values(orgPerms).some(perms => perms.includes(perm))
}

interface SettingsCard {
  key: string
  to: string
  icon: string
  title: string
  description: string
  visible: boolean
}

const cards = computed<SettingsCard[]>(() => [
  {
    key: 'ai',
    to: '/app/settings/ai',
    icon: 'i-lucide-sparkles',
    title: t('settings.index.cards.ai.title'),
    description: t('settings.index.cards.ai.description'),
    // Always visible to anyone with workspace access; manage perm gates writes.
    visible: true,
  },
  {
    key: 'audit',
    to: '/app/settings/audit',
    icon: 'i-lucide-scroll-text',
    title: t('settings.index.cards.audit.title'),
    description: t('settings.index.cards.audit.description'),
    visible: hasOrgPerm('orchestrator:audit:view'),
  },
])

const visibleCards = computed(() => cards.value.filter(c => c.visible))
</script>

<template>
  <div class="p-4 md:p-6 space-y-8 max-w-4xl">
    <header>
      <h1 class="text-2xl font-bold text-highlighted">
        {{ t('settings.index.title') }}
      </h1>
      <p class="text-muted text-sm mt-1">
        {{ t('settings.index.subtitle') }}
      </p>
    </header>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <NuxtLink
        v-for="card in visibleCards"
        :key="card.key"
        :to="card.to"
        class="block focus:outline-none"
      >
        <UCard
          class="h-full transition-colors hover:bg-accented"
          :ui="{ root: 'gap-3', body: 'flex items-start gap-3' }"
        >
          <div class="inline-flex items-center justify-center size-10 rounded-full bg-primary/10 ring ring-inset ring-primary/25 shrink-0">
            <UIcon :name="card.icon" class="size-5 text-primary" />
          </div>
          <div class="min-w-0">
            <p class="font-semibold text-highlighted">
              {{ card.title }}
            </p>
            <p class="text-sm text-muted mt-0.5">
              {{ card.description }}
            </p>
          </div>
        </UCard>
      </NuxtLink>
    </div>
  </div>
</template>
