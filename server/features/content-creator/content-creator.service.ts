import type { blogCategories, blogPosts, contentCreatorClusters, contentCreatorPillars, contentCreatorSettings } from '~~/server/database/schema'
import type { ItemService } from '~~/server/infrastructure/database/item-service'
import type { AiProviderType } from './ai-provider.factory'
import { generateObject, generateText } from 'ai'
import * as z from 'zod'
import { getModel } from './ai-provider.factory'
import { decryptApiKey, encryptApiKey } from './crypto.utils'

export interface CreateContentCreatorServiceDeps {
  settingsItemService: ItemService<typeof contentCreatorSettings>
  pillarsItemService: ItemService<typeof contentCreatorPillars>
  clustersItemService: ItemService<typeof contentCreatorClusters>
  blogPostsItemService: ItemService<typeof blogPosts>
  blogCategoriesItemService: ItemService<typeof blogCategories>
}

export const createContentCreatorService = (deps: CreateContentCreatorServiceDeps) => {
  const {
    settingsItemService,
    pillarsItemService,
    clustersItemService,
    blogPostsItemService,
    blogCategoriesItemService,
  } = deps

  // --- Settings ---

  const getSettings = async () => {
    const all = await settingsItemService.findMany({ limit: 1 })
    return all[0] ?? null
  }

  const saveSettings = async (data: {
    provider: AiProviderType
    apiKey?: string
    model?: string | null
    language?: string
    brandVoice?: string | null
    productionInterval?: string
    productionEnabled?: boolean
  }) => {
    const existing = await getSettings()

    const updateData: Record<string, unknown> = {
      provider: data.provider,
      model: data.model ?? null,
      language: data.language ?? 'en',
      productionInterval: data.productionInterval ?? 'weekly',
      productionEnabled: data.productionEnabled ?? false,
      brandVoice: data.brandVoice ?? null,
      updatedAt: new Date(),
    }

    if (data.apiKey) {
      const { encrypted, iv, tag } = encryptApiKey(data.apiKey)
      updateData.apiKeyEncrypted = encrypted
      updateData.apiKeyIv = iv
      updateData.apiKeyTag = tag
    }

    if (existing) {
      return settingsItemService.update(existing.id, updateData)
    }

    if (!data.apiKey) {
      throw createError({ statusCode: 400, statusMessage: 'API key is required for initial setup' })
    }

    const { encrypted, iv, tag } = encryptApiKey(data.apiKey)
    return settingsItemService.create({
      provider: data.provider,
      model: data.model ?? null,
      apiKeyEncrypted: encrypted,
      apiKeyIv: iv,
      apiKeyTag: tag,
      language: data.language ?? 'en',
      brandVoice: data.brandVoice ?? null,
      productionInterval: data.productionInterval ?? 'weekly',
      productionEnabled: data.productionEnabled ?? false,
    })
  }

  const languageLabels: Record<string, string> = {
    en: 'English',
    de: 'German',
    fr: 'French',
    es: 'Spanish',
    it: 'Italian',
    pt: 'Portuguese',
    nl: 'Dutch',
    pl: 'Polish',
    ja: 'Japanese',
    ko: 'Korean',
    zh: 'Chinese',
    ru: 'Russian',
    ar: 'Arabic',
    tr: 'Turkish',
    sv: 'Swedish',
    da: 'Danish',
    no: 'Norwegian',
  }

  const getDecryptedApiKey = async (): Promise<{ provider: AiProviderType, apiKey: string, model: string | null, brandVoice: string | null, language: string }> => {
    const settings = await getSettings()
    if (!settings) {
      throw createError({ statusCode: 404, statusMessage: 'Content creator settings not configured' })
    }
    const apiKey = decryptApiKey(settings.apiKeyEncrypted, settings.apiKeyIv, settings.apiKeyTag)
    return { provider: settings.provider as AiProviderType, apiKey, model: settings.model, brandVoice: settings.brandVoice, language: settings.language }
  }

  const validateConnection = async () => {
    const { provider, apiKey, model: modelId } = await getDecryptedApiKey()
    const model = getModel(provider, apiKey, modelId)
    const { text } = await generateText({
      model,
      prompt: 'Reply with exactly: OK',
    })
    return { success: text.includes('OK'), provider }
  }

  // --- Pillars ---

  const generatePillars = async (seedTopic: string) => {
    const { provider, apiKey, model: modelId, brandVoice, language } = await getDecryptedApiKey()
    const model = getModel(provider, apiKey, modelId)

    const pillarSchema = z.object({
      pillars: z.array(z.object({
        name: z.string(),
        description: z.string(),
      })).min(3).max(5),
    })

    const languageInstruction = language !== 'en' ? `Write all output in ${languageLabels[language] ?? language}.` : ''

    const { object } = await generateObject({
      model,
      schema: pillarSchema,
      system: [
        'You are an SEO content strategist.',
        languageInstruction,
        brandVoice ? `Brand voice guidelines:\n${brandVoice}` : '',
      ].filter(Boolean).join('\n\n'),
      prompt: `Generate 3-5 content pillar topics for a blog focused on: "${seedTopic}".
Each pillar should be a broad topic category that can support multiple blog posts.
Return pillar names and short descriptions.`,
    })

    const created = []
    for (const pillar of object.pillars) {
      const record = await pillarsItemService.create({
        seedTopic,
        name: pillar.name,
        description: pillar.description,
        status: 'pending',
      })
      created.push(record)
    }

    return created
  }

  const confirmPillar = async (pillarId: string) => {
    const pillar = await pillarsItemService.readOne(pillarId)
    if (!pillar) {
      throw createError({ statusCode: 404, statusMessage: 'Pillar not found' })
    }

    // Create blog category if not already linked
    let categoryId = pillar.categoryId
    if (!categoryId) {
      const slug = pillar.name.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')

      const existingCategory = await blogCategoriesItemService.findOne({ slug: { _eq: slug } })
      if (existingCategory) {
        categoryId = existingCategory.id
      }
      else {
        const category = await blogCategoriesItemService.create({
          name: pillar.name,
          slug,
        })
        categoryId = category.id
      }
    }

    return pillarsItemService.update(pillarId, {
      status: 'confirmed',
      categoryId,
      updatedAt: new Date(),
    })
  }

  const rejectPillar = async (pillarId: string) => {
    const pillar = await pillarsItemService.readOne(pillarId)
    if (!pillar) {
      throw createError({ statusCode: 404, statusMessage: 'Pillar not found' })
    }
    return pillarsItemService.update(pillarId, {
      status: 'rejected',
      updatedAt: new Date(),
    })
  }

  // --- Clusters ---

  const generateClusters = async (pillarId: string) => {
    const pillar = await pillarsItemService.readOne(pillarId)
    if (!pillar) {
      throw createError({ statusCode: 404, statusMessage: 'Pillar not found' })
    }
    if (pillar.status !== 'confirmed') {
      throw createError({ statusCode: 400, statusMessage: 'Pillar must be confirmed before generating clusters' })
    }

    const { provider, apiKey, model: modelId, brandVoice, language } = await getDecryptedApiKey()
    const model = getModel(provider, apiKey, modelId)

    const clusterSchema = z.object({
      clusters: z.array(z.object({
        title: z.string(),
        slug: z.string(),
        description: z.string(),
        keywords: z.string(),
      })).min(5).max(8),
    })

    const languageInstruction = language !== 'en' ? `Write all output in ${languageLabels[language] ?? language}.` : ''

    const { object } = await generateObject({
      model,
      schema: clusterSchema,
      system: [
        'You are an SEO content strategist.',
        languageInstruction,
        brandVoice ? `Brand voice guidelines:\n${brandVoice}` : '',
      ].filter(Boolean).join('\n\n'),
      prompt: `Generate 5-8 blog post ideas (clusters) for the content pillar: "${pillar.name}".
${pillar.description ? `Pillar description: ${pillar.description}` : ''}
For each post:
- title: SEO-optimized blog post title
- slug: URL-friendly slug (lowercase, hyphens only)
- description: Brief description of the post content
- keywords: Comma-separated target keywords`,
    })

    const created = []
    for (const cluster of object.clusters) {
      const record = await clustersItemService.create({
        pillarId,
        title: cluster.title,
        slug: cluster.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''),
        description: cluster.description,
        keywords: cluster.keywords,
        status: 'idea',
      })
      created.push(record)
    }

    return created
  }

  // --- Content Generation ---

  const generatePostContent = async (clusterId: string) => {
    const cluster = await clustersItemService.readOne(clusterId)
    if (!cluster) {
      throw createError({ statusCode: 404, statusMessage: 'Cluster not found' })
    }

    await clustersItemService.update(clusterId, { status: 'generating', updatedAt: new Date() })

    try {
      const pillar = await pillarsItemService.readOne(cluster.pillarId)
      if (!pillar) {
        throw createError({ statusCode: 404, statusMessage: 'Pillar not found' })
      }

      const { provider, apiKey, model: modelId, brandVoice, language } = await getDecryptedApiKey()
      const model = getModel(provider, apiKey, modelId)

      // Get existing posts in same category for internal linking
      let internalLinks = ''
      if (pillar.categoryId) {
        const existingPosts = await blogPostsItemService.findMany({
          filter: {
            categoryId: { _eq: pillar.categoryId },
            published: { _eq: true },
          },
          fields: ['title', 'slug'],
          limit: 20,
        })
        if (existingPosts.length > 0) {
          internalLinks = `\n\nInclude internal links to these existing articles where relevant:\n${existingPosts.map(p => `- [${p.title}](/blog/${p.slug})`).join('\n')}`
        }
      }

      const languageInstruction = language !== 'en' ? `Write all output in ${languageLabels[language] ?? language}.` : ''

      const systemPrompt = [
        'You are an expert blog content writer who creates well-structured, SEO-optimized articles.',
        languageInstruction,
        brandVoice ? `Brand voice guidelines:\n${brandVoice}` : '',
      ].filter(Boolean).join('\n\n')

      const { text: content } = await generateText({
        model,
        system: systemPrompt,
        prompt: `Write a comprehensive blog post with the following details:
Title: ${cluster.title}
${cluster.description ? `Topic: ${cluster.description}` : ''}
${cluster.keywords ? `Target keywords: ${cluster.keywords}` : ''}
${internalLinks}

Requirements:
- Write in markdown format
- Include an engaging introduction
- Use H2 and H3 headings to structure the content
- Include practical examples or actionable tips
- Write a strong conclusion
- Aim for 1200-2000 words
- Do NOT include the title as an H1 heading (it will be added separately)
- Do NOT wrap the output in code block fences or any other container — output raw markdown only`,
      })

      // Check for existing slug to avoid conflicts
      let finalSlug = cluster.slug
      const existingSlug = await blogPostsItemService.findOne({ slug: { _eq: finalSlug } })
      if (existingSlug) {
        finalSlug = `${finalSlug}-${Date.now()}`
      }

      // Create draft blog post
      const blogPost = await blogPostsItemService.create({
        title: cluster.title,
        slug: finalSlug,
        teaser: cluster.description ?? null,
        content,
        published: false,
        categoryId: pillar.categoryId ?? null,
      })

      await clustersItemService.update(clusterId, {
        status: 'generated',
        blogPostId: blogPost.id,
        generatedAt: new Date(),
        errorMessage: null,
        updatedAt: new Date(),
      })

      return blogPost
    }
    catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      await clustersItemService.update(clusterId, {
        status: 'failed',
        errorMessage: message,
        updatedAt: new Date(),
      })
      throw createError({ statusCode: 500, statusMessage: `Content generation failed: ${message}` })
    }
  }

  // --- Queue ---

  const getProductionQueue = async () => {
    return clustersItemService.findMany({
      filter: { status: { _eq: 'queued' } },
      sort: ['scheduledFor', 'priority'],
    })
  }

  const processNextInQueue = async () => {
    const queue = await clustersItemService.findMany({
      filter: {
        status: { _eq: 'queued' },
        scheduledFor: { _lte: new Date() },
      },
      sort: ['scheduledFor', 'priority'],
      limit: 1,
    })

    if (queue.length === 0) {
      return { processed: false as const, message: 'No items due in queue' }
    }

    const cluster = queue[0]!
    const blogPost = await generatePostContent(cluster.id)
    return { processed: true as const, clusterId: cluster.id, blogPostId: blogPost.id }
  }

  return {
    getSettings,
    saveSettings,
    validateConnection,
    generatePillars,
    confirmPillar,
    rejectPillar,
    generateClusters,
    generatePostContent,
    getProductionQueue,
    processNextInQueue,
  }
}

export type ContentCreatorService = ReturnType<typeof createContentCreatorService>
