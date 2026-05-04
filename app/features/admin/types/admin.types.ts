// Stats types
export interface AdminStatsResponse {
  totalUsers: number
  verifiedUsers: number
  unverifiedUsers: number
  totalOrganisations: number
  totalTeams: number
  activeSessions: number
}

export interface AdminOrganisation {
  id: string
  name: string
  slug: string
  createdAt: string
  updatedAt: string
}

export interface AdminOrganisationsResponse {
  organisations: AdminOrganisation[]
  total: number
}

export interface AdminOrganisationResponse {
  organisation: AdminOrganisation
}

export interface CreateOrganisationInput {
  name: string
  slug: string
}

export interface UpdateOrganisationInput {
  name: string
  slug: string
}

// User types
export interface AdminUser {
  id: string
  email: string | null
  name: string | null
  authProvider: string
  emailVerified: boolean
  createdAt: string
  updatedAt: string
}

export interface AdminUsersResponse {
  users: AdminUser[]
  total: number
}

export interface AdminUserResponse {
  user: AdminUser
}

export interface UpdateUserInput {
  name: string | null
  email: string
  emailVerified: boolean
}

export interface AdminUsersQueryParams {
  search?: string
  sort?: string[]
  limit?: number
  offset?: number
}

export interface AdminOrganisationsQueryParams {
  search?: string
  sort?: string[]
  limit?: number
  offset?: number
}

// Team types
export interface AdminTeam {
  id: string
  name: string
  organisationId: string
  createdAt: string
  updatedAt: string
  organisation: {
    id: string
    name: string
  }
}

export interface AdminTeamsResponse {
  teams: AdminTeam[]
  total: number
}

export interface AdminTeamsQueryParams {
  search?: string
  sort?: string[]
  limit?: number
  offset?: number
  organisationId?: string
}

// User roles types
export interface AdminUserRolePermission {
  permission: string
}

export interface AdminUserRole {
  id: string
  name: string
  description: string | null
  scope: string
  isSystem: boolean
  isDefault: boolean
  permissions: AdminUserRolePermission[]
}

export interface AdminUserRolesResponse {
  roles: AdminUserRole[]
}

export interface AdminGlobalRolesResponse {
  roles: AdminUserRole[]
}

// Team response type (single team)
export interface AdminTeamResponse {
  team: AdminTeam
}

// Team member types
export interface AdminTeamMemberUser {
  id: string
  email: string
  name: string | null
}

export interface AdminTeamMemberRole {
  id: string
  name: string
}

export interface AdminTeamMember {
  id: string
  teamId: string
  userId: string
  role: AdminTeamMemberRole | null
  createdAt: string
  updatedAt: string
  user: AdminTeamMemberUser
}

export interface AdminTeamMembersResponse {
  members: AdminTeamMember[]
  total: number
}

export interface AdminEligibleMembersResponse {
  members: AdminTeamMemberUser[]
}

// Team input types
export interface CreateTeamInput {
  name: string
}

export interface UpdateTeamInput {
  name: string
}

export interface AddTeamMemberInput {
  userId: string
}

// Blog post types
export interface AdminBlogPostAuthor {
  id: string
  name: string | null
  email: string
}

export interface AdminBlogPostTag {
  id: string
  name: string
  slug: string
}

export interface AdminBlogPostCategory {
  id: string
  name: string
  slug: string
}

export interface AdminBlogPost {
  id: string
  title: string
  slug: string
  teaser: string | null
  content: string
  published: boolean
  publishedAt: string | null
  authorId: string | null
  categoryId: string | null
  author: AdminBlogPostAuthor | null
  category: AdminBlogPostCategory | null
  tags: AdminBlogPostTag[]
  createdAt: string
  updatedAt: string
}

export interface AdminBlogPostsResponse {
  posts: AdminBlogPost[]
  total: number
}

export interface AdminBlogPostResponse {
  post: AdminBlogPost
}

export interface AdminBlogPostsQueryParams {
  search?: string
  sort?: string[]
  limit?: number
  offset?: number
}

export interface CreateBlogPostInput {
  title: string
  slug: string
  teaser?: string | null
  content: string
  published: boolean
  publishedAt?: string | null
  categoryId?: string | null
  tagIds: string[]
}

export interface UpdateBlogPostInput {
  title: string
  slug: string
  teaser?: string | null
  content: string
  published: boolean
  publishedAt?: string | null
  categoryId?: string | null
  tagIds: string[]
}

// Blog tag types
export interface AdminBlogTag {
  id: string
  name: string
  slug: string
  createdAt: string
  updatedAt: string
}

export interface AdminBlogTagsResponse {
  tags: AdminBlogTag[]
  total: number
}

export interface AdminBlogTagResponse {
  tag: AdminBlogTag
}

export interface AdminBlogTagsQueryParams {
  search?: string
  sort?: string[]
  limit?: number
  offset?: number
}

export interface CreateBlogTagInput {
  name: string
  slug: string
}

export interface UpdateBlogTagInput {
  name: string
  slug: string
}

// Blog category types
export interface AdminBlogCategory {
  id: string
  name: string
  slug: string
  createdAt: string
  updatedAt: string
}

export interface AdminBlogCategoriesResponse {
  categories: AdminBlogCategory[]
  total: number
}

export interface AdminBlogCategoryResponse {
  category: AdminBlogCategory
}

export interface AdminBlogCategoriesQueryParams {
  search?: string
  sort?: string[]
  limit?: number
  offset?: number
}

export interface CreateBlogCategoryInput {
  name: string
  slug: string
}

export interface UpdateBlogCategoryInput {
  name: string
  slug: string
}

// Content Creator types
export type AiProviderType = 'anthropic' | 'google'
export type PillarStatus = 'pending' | 'confirmed' | 'rejected'
export type ClusterStatus = 'idea' | 'approved' | 'queued' | 'generating' | 'generated' | 'failed'
export type ProductionInterval = 'every3days' | 'weekly' | 'biweekly'
export type ContentCreatorLanguage = 'en' | 'de' | 'fr' | 'es' | 'it' | 'pt' | 'nl' | 'pl' | 'ja' | 'ko' | 'zh' | 'ru' | 'ar' | 'tr' | 'sv' | 'da' | 'no'

export interface ContentCreatorSettings {
  id: string
  provider: AiProviderType
  model: string | null
  hasApiKey: boolean
  language: ContentCreatorLanguage
  brandVoice: string | null
  productionInterval: ProductionInterval
  productionEnabled: boolean
  createdAt: string
  updatedAt: string
}

export interface ContentCreatorSettingsResponse {
  settings: ContentCreatorSettings | null
}

export interface SaveContentCreatorSettingsInput {
  provider: AiProviderType
  model?: string | null
  apiKey?: string
  language: ContentCreatorLanguage
  brandVoice?: string | null
  productionInterval: ProductionInterval
  productionEnabled: boolean
}

export interface ContentCreatorPillar {
  id: string
  seedTopic: string
  name: string
  description: string | null
  categoryId: string | null
  status: PillarStatus
  category: { id: string, name: string, slug: string } | null
  clusterCount: number
  createdAt: string
  updatedAt: string
}

export interface ContentCreatorPillarsResponse {
  pillars: ContentCreatorPillar[]
  total: number
}

export interface ContentCreatorCluster {
  id: string
  pillarId: string
  title: string
  slug: string
  description: string | null
  keywords: string | null
  status: ClusterStatus
  blogPostId: string | null
  priority: number
  scheduledFor: string | null
  generatedAt: string | null
  errorMessage: string | null
  pillar: { id: string, name: string, seedTopic: string } | null
  createdAt: string
  updatedAt: string
}

export interface ContentCreatorClustersResponse {
  clusters: ContentCreatorCluster[]
  total: number
}

export interface ContentCreatorClustersQueryParams {
  pillarId?: string
  status?: ClusterStatus
  sort?: string[]
  limit?: number
  offset?: number
}

export interface UpdateClusterInput {
  title?: string
  slug?: string
  description?: string | null
  keywords?: string | null
  status?: ClusterStatus
  priority?: number
  scheduledFor?: string | null
}

export interface ContentCreatorQueueResponse {
  queue: ContentCreatorCluster[]
}

export interface ValidateConnectionResponse {
  success: boolean
  provider: AiProviderType
}

export interface ProcessQueueResponse {
  processed: boolean
  message?: string
  clusterId?: string
  blogPostId?: string
}

// Auth Provider types
export interface AdminAuthProvider {
  id: string
  provider: string
  enabled: boolean
  config: Record<string, unknown>
  displayOrder: number
  createdAt: string
  updatedAt: string
}

export interface AdminAuthProvidersResponse {
  providers: AdminAuthProvider[]
}

export interface UpdateAuthProviderInput {
  enabled: boolean
  config: Record<string, unknown>
}

// Media Library types
export interface AdminMediaMetadata {
  id: string
  alt: string | null
  title: string | null
  description: string | null
  focusX: number
  focusY: number
}

export interface AdminMediaFile {
  id: string
  filename: string
  originalName: string
  mimeType: string
  size: number
  url: string
  entityType: string | null
  createdAt: string
  updatedAt: string
  metadata: AdminMediaMetadata | null
}

export interface AdminMediaFilesResponse {
  files: AdminMediaFile[]
  total: number
}

export interface AdminMediaFileResponse {
  file: AdminMediaFile
}

export interface AdminMediaFilesQueryParams {
  search?: string
  sort?: string[]
  limit?: number
  offset?: number
}

export interface UpdateMediaMetadataInput {
  alt?: string | null
  title?: string | null
  description?: string | null
  focusX?: number
  focusY?: number
}
