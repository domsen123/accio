import type {
  AddTeamMemberInput,
  AdminAuthProvidersResponse,
  AdminBlogCategoriesQueryParams,
  AdminBlogCategoriesResponse,
  AdminBlogCategoryResponse,
  AdminBlogPostResponse,
  AdminBlogPostsQueryParams,
  AdminBlogPostsResponse,
  AdminBlogTagResponse,
  AdminBlogTagsQueryParams,
  AdminBlogTagsResponse,
  AdminEligibleMembersResponse,
  AdminGlobalRolesResponse,
  AdminMediaFileResponse,
  AdminMediaFilesQueryParams,
  AdminMediaFilesResponse,
  AdminOrganisationResponse,
  AdminOrganisationsQueryParams,
  AdminOrganisationsResponse,
  AdminStatsResponse,
  AdminTeam,
  AdminTeamMember,
  AdminTeamMembersResponse,
  AdminTeamResponse,
  AdminTeamsQueryParams,
  AdminTeamsResponse,
  AdminUserResponse,
  AdminUserRolesResponse,
  AdminUsersQueryParams,
  AdminUsersResponse,
  ContentCreatorClustersQueryParams,
  ContentCreatorClustersResponse,
  ContentCreatorPillarsResponse,
  ContentCreatorQueueResponse,
  ContentCreatorSettingsResponse,
  CreateBlogCategoryInput,
  CreateBlogPostInput,
  CreateBlogTagInput,
  CreateOrganisationInput,
  CreateTeamInput,
  ProcessQueueResponse,
  SaveContentCreatorSettingsInput,
  UpdateAuthProviderInput,
  UpdateBlogCategoryInput,
  UpdateBlogPostInput,
  UpdateBlogTagInput,
  UpdateClusterInput,
  UpdateMediaMetadataInput,
  UpdateOrganisationInput,
  UpdateTeamInput,
  UpdateUserInput,
  ValidateConnectionResponse,
} from '../types/admin.types'

/**
 * Admin API wrapper using global $api for SSR cookie forwarding.
 * Must be called within a composable or component setup context.
 */
export const useAdminApi = () => {
  const { $api } = useNuxtApp()

  return {
    // Stats
    getStats: (): Promise<AdminStatsResponse> =>
      $api('/api/admin/stats'),

    // Organisations
    getOrganisations: (params?: AdminOrganisationsQueryParams): Promise<AdminOrganisationsResponse> =>
      $api('/api/admin/organisations', { query: params }),

    getOrganisation: (id: string): Promise<AdminOrganisationResponse> =>
      $api(`/api/admin/organisations/${id}`),

    createOrganisation: (data: CreateOrganisationInput): Promise<AdminOrganisationResponse> =>
      $api('/api/admin/organisations', {
        method: 'POST',
        body: data,
      }),

    updateOrganisation: (id: string, data: UpdateOrganisationInput): Promise<AdminOrganisationResponse> =>
      $api(`/api/admin/organisations/${id}`, {
        method: 'PUT',
        body: data,
      }),

    // Users
    getUsers: (params?: AdminUsersQueryParams): Promise<AdminUsersResponse> =>
      $api('/api/admin/users', { query: params }),

    getUser: (id: string): Promise<AdminUserResponse> =>
      $api(`/api/admin/users/${id}`),

    updateUser: (id: string, data: UpdateUserInput): Promise<AdminUserResponse> =>
      $api(`/api/admin/users/${id}`, {
        method: 'PUT',
        body: data,
      }),

    deleteUser: (id: string): Promise<{ success: boolean }> =>
      $api(`/api/admin/users/${id}`, {
        method: 'DELETE',
      }),

    getUserRoles: (userId: string): Promise<AdminUserRolesResponse> =>
      $api(`/api/admin/users/${userId}/roles`),

    assignUserRole: (userId: string, roleId: string): Promise<{ success: boolean }> =>
      $api(`/api/admin/users/${userId}/roles`, {
        method: 'POST',
        body: { roleId },
      }),

    removeUserRole: (userId: string, roleId: string): Promise<{ success: boolean }> =>
      $api(`/api/admin/users/${userId}/roles/${roleId}`, {
        method: 'DELETE',
      }),

    getGlobalRoles: (): Promise<AdminGlobalRolesResponse> =>
      $api('/api/rbac/roles'),

    // Teams
    getTeams: (params?: AdminTeamsQueryParams): Promise<AdminTeamsResponse> =>
      $api('/api/admin/teams', { query: params }),

    getOrganisationTeams: (organisationId: string): Promise<{ teams: AdminTeam[], total: number }> =>
      $api(`/api/admin/organisations/${organisationId}/teams`),

    getTeam: (id: string): Promise<AdminTeamResponse> =>
      $api(`/api/admin/teams/${id}`),

    createTeam: (organisationId: string, data: CreateTeamInput): Promise<AdminTeamResponse> =>
      $api(`/api/admin/organisations/${organisationId}/teams`, {
        method: 'POST',
        body: data,
      }),

    updateTeam: (id: string, data: UpdateTeamInput): Promise<AdminTeamResponse> =>
      $api(`/api/admin/teams/${id}`, {
        method: 'PUT',
        body: data,
      }),

    deleteTeam: (id: string): Promise<{ success: boolean }> =>
      $api(`/api/admin/teams/${id}`, { method: 'DELETE' }),

    // Team Members
    getTeamMembers: (teamId: string): Promise<AdminTeamMembersResponse> =>
      $api(`/api/admin/teams/${teamId}/members`),

    addTeamMember: (teamId: string, data: AddTeamMemberInput): Promise<{ member: AdminTeamMember }> =>
      $api(`/api/admin/teams/${teamId}/members`, {
        method: 'POST',
        body: data,
      }),

    removeTeamMember: (teamId: string, userId: string): Promise<{ success: boolean }> =>
      $api(`/api/admin/teams/${teamId}/members/${userId}`, { method: 'DELETE' }),

    getTeamEligibleMembers: (teamId: string): Promise<AdminEligibleMembersResponse> =>
      $api(`/api/admin/teams/${teamId}/eligible-members`),

    // Blog Posts
    getBlogPosts: (params?: AdminBlogPostsQueryParams): Promise<AdminBlogPostsResponse> =>
      $api('/api/admin/blog/posts', { query: params }),

    getBlogPost: (id: string): Promise<AdminBlogPostResponse> =>
      $api(`/api/admin/blog/posts/${id}`),

    createBlogPost: (data: CreateBlogPostInput): Promise<AdminBlogPostResponse> =>
      $api('/api/admin/blog/posts', { method: 'POST', body: data }),

    updateBlogPost: (id: string, data: UpdateBlogPostInput): Promise<AdminBlogPostResponse> =>
      $api(`/api/admin/blog/posts/${id}`, { method: 'PUT', body: data }),

    deleteBlogPost: (id: string): Promise<{ success: boolean }> =>
      $api(`/api/admin/blog/posts/${id}`, { method: 'DELETE' }),

    // Blog Tags
    getBlogTags: (params?: AdminBlogTagsQueryParams): Promise<AdminBlogTagsResponse> =>
      $api('/api/admin/blog/tags', { query: params }),

    createBlogTag: (data: CreateBlogTagInput): Promise<AdminBlogTagResponse> =>
      $api('/api/admin/blog/tags', { method: 'POST', body: data }),

    updateBlogTag: (id: string, data: UpdateBlogTagInput): Promise<AdminBlogTagResponse> =>
      $api(`/api/admin/blog/tags/${id}`, { method: 'PUT', body: data }),

    deleteBlogTag: (id: string): Promise<{ success: boolean }> =>
      $api(`/api/admin/blog/tags/${id}`, { method: 'DELETE' }),

    // Blog Categories
    getBlogCategories: (params?: AdminBlogCategoriesQueryParams): Promise<AdminBlogCategoriesResponse> =>
      $api('/api/admin/blog/categories', { query: params }),

    createBlogCategory: (data: CreateBlogCategoryInput): Promise<AdminBlogCategoryResponse> =>
      $api('/api/admin/blog/categories', { method: 'POST', body: data }),

    updateBlogCategory: (id: string, data: UpdateBlogCategoryInput): Promise<AdminBlogCategoryResponse> =>
      $api(`/api/admin/blog/categories/${id}`, { method: 'PUT', body: data }),

    deleteBlogCategory: (id: string): Promise<{ success: boolean }> =>
      $api(`/api/admin/blog/categories/${id}`, { method: 'DELETE' }),

    // Content Creator - Settings
    getContentCreatorSettings: (): Promise<ContentCreatorSettingsResponse> =>
      $api('/api/admin/blog/content-creator/settings'),

    saveContentCreatorSettings: (data: SaveContentCreatorSettingsInput): Promise<ContentCreatorSettingsResponse> =>
      $api('/api/admin/blog/content-creator/settings', { method: 'PUT', body: data }),

    validateContentCreatorConnection: (): Promise<ValidateConnectionResponse> =>
      $api('/api/admin/blog/content-creator/validate-connection', { method: 'POST' }),

    // Content Creator - Pillars
    getContentCreatorPillars: (params?: { status?: string }): Promise<ContentCreatorPillarsResponse> =>
      $api('/api/admin/blog/content-creator/pillars', { query: params }),

    generateContentCreatorPillars: (seedTopic: string): Promise<ContentCreatorPillarsResponse> =>
      $api('/api/admin/blog/content-creator/pillars/generate', { method: 'POST', body: { seedTopic } }),

    updateContentCreatorPillar: (id: string, action: 'confirm' | 'reject'): Promise<{ pillar: unknown }> =>
      $api(`/api/admin/blog/content-creator/pillars/${id}`, { method: 'PUT', body: { action } }),

    deleteContentCreatorPillar: (id: string): Promise<{ success: boolean }> =>
      $api(`/api/admin/blog/content-creator/pillars/${id}`, { method: 'DELETE' }),

    // Content Creator - Clusters
    getContentCreatorClusters: (params?: ContentCreatorClustersQueryParams): Promise<ContentCreatorClustersResponse> =>
      $api('/api/admin/blog/content-creator/clusters', { query: params }),

    generateContentCreatorClusters: (pillarId: string): Promise<{ clusters: unknown[] }> =>
      $api('/api/admin/blog/content-creator/clusters/generate', { method: 'POST', body: { pillarId } }),

    updateContentCreatorCluster: (id: string, data: UpdateClusterInput): Promise<{ cluster: unknown }> =>
      $api(`/api/admin/blog/content-creator/clusters/${id}`, { method: 'PUT', body: data }),

    deleteContentCreatorCluster: (id: string): Promise<{ success: boolean }> =>
      $api(`/api/admin/blog/content-creator/clusters/${id}`, { method: 'DELETE' }),

    generateContentCreatorClusterContent: (id: string): Promise<{ blogPost: unknown }> =>
      $api(`/api/admin/blog/content-creator/clusters/${id}/generate-content`, { method: 'POST' }),

    // Content Creator - Queue
    getContentCreatorQueue: (): Promise<ContentCreatorQueueResponse> =>
      $api('/api/admin/blog/content-creator/queue'),

    processContentCreatorQueue: (): Promise<ProcessQueueResponse> =>
      $api('/api/admin/blog/content-creator/queue/process', { method: 'POST' }),

    // Auth Providers
    getAuthProviders: (): Promise<AdminAuthProvidersResponse> =>
      $api('/api/admin/settings/auth-providers'),

    updateAuthProvider: (provider: string, data: UpdateAuthProviderInput): Promise<{ provider: AdminAuthProvidersResponse['providers'][number] }> =>
      $api(`/api/admin/settings/auth-providers/${provider}`, {
        method: 'PUT',
        body: data,
      }),

    // Media Library
    getMediaFiles: (params?: AdminMediaFilesQueryParams): Promise<AdminMediaFilesResponse> =>
      $api('/api/admin/media', { query: params }),

    getMediaFile: (id: string): Promise<AdminMediaFileResponse> =>
      $api(`/api/admin/media/${id}`),

    updateMediaMetadata: (id: string, data: UpdateMediaMetadataInput): Promise<AdminMediaFileResponse> =>
      $api(`/api/admin/media/${id}`, { method: 'PUT', body: data }),

    deleteMediaFile: (id: string): Promise<{ success: boolean }> =>
      $api(`/api/admin/media/${id}`, { method: 'DELETE' }),
  }
}
