<script setup lang="ts">
import type { EditorToolbarItem, FormSubmitEvent } from '@nuxt/ui'
import type { AiProviderType, ContentCreatorLanguage, ProductionInterval } from '../types/admin.types'
import * as z from 'zod'
import { DEFAULT_MODELS, PROVIDER_MODELS } from '~~/shared/content-creator.constants'

const emit = defineEmits<{
  connected: []
}>()

const toast = useToast()

const toolbarItems: EditorToolbarItem[][] = [
  [
    { kind: 'undo', icon: 'i-lucide-undo', tooltip: { text: 'Undo' } },
    { kind: 'redo', icon: 'i-lucide-redo', tooltip: { text: 'Redo' } },
  ],
  [
    {
      icon: 'i-lucide-heading',
      tooltip: { text: 'Headings' },
      content: { align: 'start' },
      items: [
        { kind: 'heading', level: 1, icon: 'i-lucide-heading-1', label: 'Heading 1' },
        { kind: 'heading', level: 2, icon: 'i-lucide-heading-2', label: 'Heading 2' },
        { kind: 'heading', level: 3, icon: 'i-lucide-heading-3', label: 'Heading 3' },
      ],
    },
    { kind: 'bulletList', icon: 'i-lucide-list', tooltip: { text: 'Bullet List' } },
    { kind: 'orderedList', icon: 'i-lucide-list-ordered', tooltip: { text: 'Ordered List' } },
  ],
  [
    { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', tooltip: { text: 'Bold' } },
    { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', tooltip: { text: 'Italic' } },
  ],
]

const { settings, isLoading: settingsLoading } = useContentCreatorSettings()
const { mutateAsync: saveSettings, asyncStatus: saveStatus } = useSaveContentCreatorSettings()
const { mutateAsync: validateConnection, asyncStatus: validateStatus } = useValidateContentCreatorConnection()

const connectionValidated = ref(false)

const schema = z.object({
  provider: z.enum(['anthropic', 'google']),
  model: z.string().trim().min(1),
  apiKey: z.string().trim().optional(),
  language: z.enum(['en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'ja', 'ko', 'zh', 'ru', 'ar', 'tr', 'sv', 'da', 'no']),
  brandVoice: z.string().trim().optional(),
  productionInterval: z.enum(['every3days', 'weekly', 'biweekly']),
  productionEnabled: z.boolean(),
})

const state = reactive({
  provider: 'anthropic' as 'anthropic' | 'google',
  model: DEFAULT_MODELS.anthropic,
  apiKey: undefined as string | undefined,
  language: 'en' as ContentCreatorLanguage,
  brandVoice: '',
  productionInterval: 'weekly' as 'every3days' | 'weekly' | 'biweekly',
  productionEnabled: false,
})

watch(settings, (s) => {
  if (s) {
    state.provider = s.provider as AiProviderType
    state.model = s.model ?? DEFAULT_MODELS[s.provider] ?? ''
    state.language = (s.language ?? 'en') as ContentCreatorLanguage
    state.brandVoice = s.brandVoice ?? ''
    state.productionInterval = s.productionInterval as ProductionInterval
    state.productionEnabled = s.productionEnabled
    state.apiKey = undefined
    connectionValidated.value = true
  }
}, { immediate: true })

const modelOptions = computed((): { label: string, value: string }[] => {
  return [...(PROVIDER_MODELS[state.provider] ?? [])]
})

watch(() => state.provider, (newProvider) => {
  state.model = DEFAULT_MODELS[newProvider] ?? ''
})

const providerOptions = [
  { label: 'Anthropic (Claude)', value: 'anthropic' },
  { label: 'Google (Gemini)', value: 'google' },
]

const languageOptions = [
  { label: 'English', value: 'en' },
  { label: 'German', value: 'de' },
  { label: 'French', value: 'fr' },
  { label: 'Spanish', value: 'es' },
  { label: 'Italian', value: 'it' },
  { label: 'Portuguese', value: 'pt' },
  { label: 'Dutch', value: 'nl' },
  { label: 'Polish', value: 'pl' },
  { label: 'Japanese', value: 'ja' },
  { label: 'Korean', value: 'ko' },
  { label: 'Chinese', value: 'zh' },
  { label: 'Russian', value: 'ru' },
  { label: 'Arabic', value: 'ar' },
  { label: 'Turkish', value: 'tr' },
  { label: 'Swedish', value: 'sv' },
  { label: 'Danish', value: 'da' },
  { label: 'Norwegian', value: 'no' },
]

const intervalOptions = [
  { label: 'Every 3 days', value: 'every3days' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Biweekly', value: 'biweekly' },
]

const isSaving = computed(() => saveStatus.value === 'loading')
const isValidating = computed(() => validateStatus.value === 'loading')

type Schema = z.output<typeof schema>

const onSubmit = async (event: FormSubmitEvent<Schema>) => {
  try {
    await saveSettings({
      provider: event.data.provider,
      model: event.data.model,
      apiKey: event.data.apiKey || undefined,
      language: event.data.language,
      brandVoice: event.data.brandVoice || null,
      productionInterval: event.data.productionInterval,
      productionEnabled: event.data.productionEnabled,
    })
    state.apiKey = undefined
    toast.add({ title: 'Settings saved', color: 'success' })
  }
  catch (err: unknown) {
    const error = err as { data?: { statusMessage?: string }, message?: string }
    toast.add({
      title: 'Failed to save settings',
      description: error.data?.statusMessage || error.message || 'An error occurred',
      color: 'error',
    })
  }
}

const onValidate = async () => {
  try {
    const result = await validateConnection()
    if (result.success) {
      connectionValidated.value = true
      toast.add({ title: 'Connection verified', description: `Connected to ${result.provider}`, color: 'success' })
      emit('connected')
    }
    else {
      toast.add({ title: 'Connection failed', description: 'Could not connect to AI provider', color: 'error' })
    }
  }
  catch (err: unknown) {
    const error = err as { data?: { statusMessage?: string }, message?: string }
    toast.add({
      title: 'Connection failed',
      description: error.data?.statusMessage || error.message || 'An error occurred',
      color: 'error',
    })
  }
}
</script>

<template>
  <div v-if="settingsLoading" class="flex items-center justify-center py-12">
    <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
  </div>
  <UForm
    v-else
    :schema="schema"
    :state="state"
    @submit="onSubmit"
  >
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <!-- Main: Brand Voice Editor -->
      <div class="lg:col-span-8">
        <UFormField label="Brand Voice" name="brandVoice" description="Markdown guidelines injected as system prompt for all AI generations.">
          <UEditor
            v-slot="{ editor }"
            v-model="state.brandVoice"
            content-type="markdown"
            placeholder="e.g. Write in a professional yet approachable tone. Use active voice. Target audience: software developers..."
            class="w-full min-h-80 flex flex-col gap-4 rounded-lg bg-elevated/50 ring ring-default p-4"
          >
            <UEditorToolbar :editor="editor" :items="toolbarItems" class="pb-4 border-b border-default" />
          </UEditor>
        </UFormField>
      </div>

      <!-- Sidebar -->
      <div class="lg:col-span-4 space-y-4 lg:sticky lg:top-4 lg:self-start">
        <!-- AI Provider Card -->
        <UPageCard title="AI Provider" variant="subtle">
          <div class="space-y-4">
            <UFormField label="Provider" name="provider" required>
              <USelect
                v-model="state.provider"
                :items="providerOptions"
                value-key="value"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Model" name="model">
              <USelect
                v-model="state.model"
                :items="modelOptions"
                value-key="value"
                class="w-full"
              />
            </UFormField>

            <UFormField label="API Key" name="apiKey" :required="!settings">
              <UInput
                v-model="state.apiKey"
                type="password"
                :placeholder="settings?.hasApiKey ? '(unchanged)' : 'Enter API key'"
              />
            </UFormField>

            <UFormField label="Language" name="language">
              <USelect
                v-model="state.language"
                :items="languageOptions"
                value-key="value"
                class="w-full"
              />
            </UFormField>
          </div>
        </UPageCard>

        <!-- Production Card -->
        <UPageCard title="Production" variant="subtle">
          <div class="space-y-4">
            <UFormField label="Interval" name="productionInterval">
              <USelect
                v-model="state.productionInterval"
                :items="intervalOptions"
                value-key="value"
                class="w-full"
              />
            </UFormField>

            <UFormField name="productionEnabled">
              <USwitch
                v-model="state.productionEnabled"
                label="Auto-Production"
              />
            </UFormField>

            <USeparator />

            <div class="space-y-2">
              <UButton
                type="submit"
                block
                :loading="isSaving"
              >
                Save Settings
              </UButton>
              <UButton
                variant="outline"
                block
                :loading="isValidating"
                :disabled="!settings?.hasApiKey && !state.apiKey"
                @click="onValidate"
              >
                Test Connection
              </UButton>
            </div>

            <UBadge
              v-if="connectionValidated"
              color="success"
              variant="subtle"
            >
              Connected
            </UBadge>
          </div>
        </UPageCard>
      </div>
    </div>
  </UForm>
</template>
