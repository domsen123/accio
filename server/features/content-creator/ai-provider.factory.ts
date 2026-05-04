import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { DEFAULT_MODELS } from '~~/shared/content-creator.constants'

export type AiProviderType = 'anthropic' | 'google'

export const getModel = (providerType: AiProviderType, apiKey: string, modelId?: string | null) => {
  const resolvedModel = modelId ?? DEFAULT_MODELS[providerType]
  if (!resolvedModel) {
    throw createError({ statusCode: 400, statusMessage: `No model configured for provider: ${providerType}` })
  }

  switch (providerType) {
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey })
      return anthropic(resolvedModel as Parameters<typeof anthropic>[0])
    }
    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey })
      return google(resolvedModel as Parameters<typeof google>[0])
    }
    default:
      throw createError({ statusCode: 400, statusMessage: `Unsupported AI provider: ${providerType}` })
  }
}
