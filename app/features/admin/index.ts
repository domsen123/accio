// API
export { useAdminApi } from './api/admin.api'
export { adminKeys } from './api/admin.keys'

// Editor Extensions
export { ImageUpload } from './components/EditorImageUploadExtension'

export { useAdminBlogCategories } from './composables/useAdminBlogCategories'
export { useCreateBlogCategory, useDeleteBlogCategory, useUpdateBlogCategory } from './composables/useAdminBlogCategoryMutations'
// Blog Composables
export { useAdminBlogPost } from './composables/useAdminBlogPost'
export { useCreateBlogPost, useDeleteBlogPost, useUpdateBlogPost } from './composables/useAdminBlogPostMutations'
export { useAdminBlogPosts } from './composables/useAdminBlogPosts'
export { useCreateBlogTag, useDeleteBlogTag, useUpdateBlogTag } from './composables/useAdminBlogTagMutations'
export { useAdminBlogTags } from './composables/useAdminBlogTags'
// Media Library Composables
export { useAdminMediaFile } from './composables/useAdminMediaFile'
export { useAdminMediaFiles } from './composables/useAdminMediaFiles'
export { useDeleteMediaFile, useUpdateMediaMetadata } from './composables/useAdminMediaMutations'
// Organisation Composables
export { useAdminOrganisation } from './composables/useAdminOrganisation'

export { useCreateOrganisation, useUpdateOrganisation } from './composables/useAdminOrganisationMutations'
export { useAdminOrganisations } from './composables/useAdminOrganisations'
export { useAdminOrganisationTeams } from './composables/useAdminOrganisationTeams'
// Team Composables
export { useAdminTeam } from './composables/useAdminTeam'
export { useAdminTeamEligibleMembers } from './composables/useAdminTeamEligibleMembers'
export { useAddTeamMember, useRemoveTeamMember } from './composables/useAdminTeamMemberMutations'
export { useAdminTeamMembers } from './composables/useAdminTeamMembers'
export { useCreateTeam, useDeleteTeam, useUpdateTeam } from './composables/useAdminTeamMutations'

export { useAdminTeams } from './composables/useAdminTeams'
// User Composables
export { useAdminUser } from './composables/useAdminUser'
export { useDeleteUser, useUpdateUser } from './composables/useAdminUserMutations'
export { useAdminGlobalRoles, useAdminUserRoles, useAssignUserRole, useRemoveUserRole } from './composables/useAdminUserRoles'

export { useAdminUsers } from './composables/useAdminUsers'
// Content Creator Composables
export { useDeleteContentCreatorCluster, useGenerateContentCreatorClusterContent, useGenerateContentCreatorClusters, useUpdateContentCreatorCluster } from './composables/useContentCreatorClusterMutations'
export { useContentCreatorClusters } from './composables/useContentCreatorClusters'
export { useDeleteContentCreatorPillar, useGenerateContentCreatorPillars, useUpdateContentCreatorPillar } from './composables/useContentCreatorPillarMutations'
export { useContentCreatorPillars } from './composables/useContentCreatorPillars'
export { useContentCreatorQueue, useProcessContentCreatorQueue } from './composables/useContentCreatorQueue'
export { useContentCreatorSettings, useSaveContentCreatorSettings, useValidateContentCreatorConnection } from './composables/useContentCreatorSettings'

// Types
export type {
  // Team types
  AddTeamMemberInput,
  AdminBlogCategoriesQueryParams,
  AdminBlogCategoriesResponse,
  // Blog types
  AdminBlogCategory,
  AdminBlogCategoryResponse,
  AdminBlogPost,
  AdminBlogPostAuthor,
  AdminBlogPostCategory,
  AdminBlogPostResponse,
  AdminBlogPostsQueryParams,
  AdminBlogPostsResponse,
  AdminBlogPostTag,
  AdminBlogTag,
  AdminBlogTagResponse,
  AdminBlogTagsQueryParams,
  AdminBlogTagsResponse,
  AdminEligibleMembersResponse,
  AdminGlobalRolesResponse,
  // Media Library types
  AdminMediaFile,
  AdminMediaFileResponse,
  AdminMediaFilesQueryParams,
  AdminMediaFilesResponse,
  AdminMediaMetadata,
  // Organisation types
  AdminOrganisation,
  AdminOrganisationResponse,
  AdminOrganisationsQueryParams,
  AdminOrganisationsResponse,
  AdminTeam,
  AdminTeamMember,
  AdminTeamMemberRole,
  AdminTeamMembersResponse,
  AdminTeamMemberUser,
  AdminTeamResponse,
  AdminTeamsQueryParams,
  AdminTeamsResponse,
  // User types
  AdminUser,
  AdminUserResponse,
  AdminUserRole,
  AdminUserRolePermission,
  AdminUserRolesResponse,
  AdminUsersQueryParams,
  AdminUsersResponse,
  // Content Creator types
  AiProviderType,
  ClusterStatus,
  ContentCreatorCluster,
  ContentCreatorClustersQueryParams,
  ContentCreatorClustersResponse,
  ContentCreatorPillar,
  ContentCreatorPillarsResponse,
  ContentCreatorQueueResponse,
  ContentCreatorSettings,
  ContentCreatorSettingsResponse,
  CreateBlogCategoryInput,
  CreateBlogPostInput,
  CreateBlogTagInput,
  CreateOrganisationInput,
  CreateTeamInput,
  PillarStatus,
  ProcessQueueResponse,
  ProductionInterval,
  SaveContentCreatorSettingsInput,
  UpdateBlogCategoryInput,
  UpdateBlogPostInput,
  UpdateBlogTagInput,
  UpdateClusterInput,
  UpdateMediaMetadataInput,
  UpdateOrganisationInput,
  UpdateTeamInput,
  UpdateUserInput,
  ValidateConnectionResponse,
} from './types/admin.types'
