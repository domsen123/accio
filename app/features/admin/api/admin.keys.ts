import type { AdminBlogCategoriesQueryParams, AdminBlogPostsQueryParams, AdminBlogTagsQueryParams, AdminMediaFilesQueryParams, AdminOrganisationsQueryParams, AdminTeamsQueryParams, AdminUsersQueryParams, ContentCreatorClustersQueryParams } from '../types/admin.types'

export const adminKeys = {
  all: ['admin'] as const,
  stats: () => [...adminKeys.all, 'stats'] as const,
  organisations: (params?: AdminOrganisationsQueryParams) => params
    ? [...adminKeys.all, 'organisations', params] as const
    : [...adminKeys.all, 'organisations'] as const,
  organisation: (id: string) => [...adminKeys.all, 'organisation', id] as const,
  organisationTeams: (organisationId: string) => [...adminKeys.all, 'organisation', organisationId, 'teams'] as const,
  users: (params?: AdminUsersQueryParams) => params
    ? [...adminKeys.all, 'users', params] as const
    : [...adminKeys.all, 'users'] as const,
  user: (id: string) => [...adminKeys.all, 'user', id] as const,
  userRoles: (userId: string) => [...adminKeys.all, 'user', userId, 'roles'] as const,
  teams: (params?: AdminTeamsQueryParams) => params
    ? [...adminKeys.all, 'teams', params] as const
    : [...adminKeys.all, 'teams'] as const,
  team: (id: string) => [...adminKeys.all, 'team', id] as const,
  teamMembers: (teamId: string) => [...adminKeys.all, 'team', teamId, 'members'] as const,
  teamEligibleMembers: (teamId: string) => [...adminKeys.all, 'team', teamId, 'eligible-members'] as const,
  blogPosts: (params?: AdminBlogPostsQueryParams) => params
    ? [...adminKeys.all, 'blogPosts', params] as const
    : [...adminKeys.all, 'blogPosts'] as const,
  blogPost: (id: string) => [...adminKeys.all, 'blogPost', id] as const,
  blogTags: (params?: AdminBlogTagsQueryParams) => params
    ? [...adminKeys.all, 'blogTags', params] as const
    : [...adminKeys.all, 'blogTags'] as const,
  blogCategories: (params?: AdminBlogCategoriesQueryParams) => params
    ? [...adminKeys.all, 'blogCategories', params] as const
    : [...adminKeys.all, 'blogCategories'] as const,
  contentCreatorSettings: () => [...adminKeys.all, 'contentCreatorSettings'] as const,
  contentCreatorPillars: (params?: { status?: string }) => params
    ? [...adminKeys.all, 'contentCreatorPillars', params] as const
    : [...adminKeys.all, 'contentCreatorPillars'] as const,
  contentCreatorClusters: (params?: ContentCreatorClustersQueryParams) => params
    ? [...adminKeys.all, 'contentCreatorClusters', params] as const
    : [...adminKeys.all, 'contentCreatorClusters'] as const,
  contentCreatorQueue: () => [...adminKeys.all, 'contentCreatorQueue'] as const,
  mediaFiles: (params?: AdminMediaFilesQueryParams) => params
    ? [...adminKeys.all, 'mediaFiles', params] as const
    : [...adminKeys.all, 'mediaFiles'] as const,
  mediaFile: (id: string) => [...adminKeys.all, 'mediaFile', id] as const,
  globalRoles: () => [...adminKeys.all, 'globalRoles'] as const,
  authProviders: () => [...adminKeys.all, 'authProviders'] as const,
}
