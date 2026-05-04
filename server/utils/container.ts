import type { ImpersonationService } from '../features/admin/impersonation.service'
import type { AuthProvidersService } from '../features/auth/auth-providers.service'
import type { AuthService } from '../features/auth/auth.service'
import type { ContentCreatorService } from '../features/content-creator/content-creator.service'
import type { EmailProvider } from '../features/email/email-provider.interface'
import type { EmailService } from '../features/email/email.service'
import type { FileStoreProvider } from '../features/files/file-store-provider.interface'
import type { FileService } from '../features/files/files.service'
import type { ImageProcessingService } from '../features/files/image-processing.service'
import type { MediaLibraryService } from '../features/files/media-library.service'
import type { OrganisationInvitationsService } from '../features/organisation-invitations/organisation-invitations.service'
import type { OrganisationMembersService } from '../features/organisation-members/organisation-members.service'
import type { OrganisationsService } from '../features/organisations/organisations.service'
import type { ProfileService } from '../features/profile/profile.service'
import type { RbacService } from '../features/rbac/rbac.service'
import type { EventBus } from '../infrastructure/events'
import * as schema from '../database/schema'
import { createImpersonationService } from '../features/admin/impersonation.service'
import { createAuthProvidersService } from '../features/auth/auth-providers.service'
import { createAuthService } from '../features/auth/auth.service'
import { createContentCreatorService } from '../features/content-creator/content-creator.service'
import { createEmailService } from '../features/email/email.service'
import { createConsoleEmailProvider } from '../features/email/providers/console.provider'
import { createNodemailerProvider } from '../features/email/providers/nodemailer.provider'
import { createFileService } from '../features/files/files.service'
import { createImageProcessingService } from '../features/files/image-processing.service'
import { createMediaLibraryService } from '../features/files/media-library.service'
import { createLocalFileStoreProvider } from '../features/files/providers/local.provider'
import { createOrganisationInvitationsService } from '../features/organisation-invitations/organisation-invitations.service'
import { createOrganisationMembersService } from '../features/organisation-members/organisation-members.service'
import { createOrganisationsService } from '../features/organisations/organisations.service'
import { createProfileService } from '../features/profile/profile.service'
import { createRbacService } from '../features/rbac/rbac.service'
import { getDatabase } from '../infrastructure/database/client'
import { createItemService } from '../infrastructure/database/item-service'
import { createEventBus } from '../infrastructure/events'
import { config } from './config'

// Lazy initialization helper
const lazy = <T>(factory: () => T): (() => T) => {
  let instance: T | undefined
  return () => {
    if (!instance) {
      instance = factory()
    }
    return instance
  }
}

// Email provider factory
const getEmailProvider = lazy((): EmailProvider => {
  if (config.email.provider === 'smtp') {
    if (!config.email.smtp.host) {
      console.warn('[Email] SMTP provider configured but no host found. Falling back to console.')
      return createConsoleEmailProvider()
    }
    return createNodemailerProvider({
      host: config.email.smtp.host,
      port: config.email.smtp.port,
      user: config.email.smtp.user || undefined,
      pass: config.email.smtp.pass || undefined,
      from: config.email.smtp.from,
    })
  }
  return createConsoleEmailProvider()
})

// File store provider factory
const getFileStoreProvider = lazy((): FileStoreProvider => {
  // Only local provider implemented for now
  return createLocalFileStoreProvider({
    basePath: config.storage.local.basePath,
  })
})

// Event Bus
const getEventBus = lazy(() => createEventBus())

// Services
const getEmailService = lazy(() =>
  createEmailService({
    provider: getEmailProvider(),
    config,
  }),
)

const getAuthService = lazy(() =>
  createAuthService({
    db: getDatabase('app'),
    emailService: getEmailService(),
    eventBus: getEventBus(),
  }),
)

const getAuthProvidersService = lazy(() =>
  createAuthProvidersService({
    db: getDatabase('app'),
  }),
)

const getImpersonationService = lazy(() =>
  createImpersonationService({
    db: getDatabase('app'),
  }),
)

// ItemService instances - one per table
const getUsersItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.users, tableName: 'users', eventBus: getEventBus() }),
)
const getOrganisationsItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.organisations, tableName: 'organisations', eventBus: getEventBus() }),
)
const getTeamsItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.teams, tableName: 'teams', eventBus: getEventBus() }),
)
const getOrganisationMembersItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.organisationMembers, tableName: 'organisationMembers', eventBus: getEventBus() }),
)
const getTeamMembersItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.teamMembers, tableName: 'teamMembers', eventBus: getEventBus() }),
)
const getSessionsItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.sessions, tableName: 'sessions', eventBus: getEventBus() }),
)
const getPasswordResetTokensItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.passwordResetTokens, tableName: 'passwordResetTokens', eventBus: getEventBus() }),
)
const getPendingEmailChangesItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.pendingEmailChanges, tableName: 'pendingEmailChanges', eventBus: getEventBus() }),
)
const getRolesItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.roles, tableName: 'roles', eventBus: getEventBus() }),
)
const getRolePermissionsItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.rolePermissions, tableName: 'rolePermissions', eventBus: getEventBus() }),
)
const getUserRolesItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.userRoles, tableName: 'userRoles', eventBus: getEventBus() }),
)
const getOrganisationInvitationsItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.organisationInvitations, tableName: 'organisationInvitations', eventBus: getEventBus() }),
)
const getFilesItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.files, tableName: 'files', eventBus: getEventBus() }),
)
const getBlogPostsItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.blogPosts, tableName: 'blogPosts', eventBus: getEventBus() }),
)
const getBlogTagsItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.blogTags, tableName: 'blogTags', eventBus: getEventBus() }),
)
const getBlogPostTagsItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.blogPostTags, tableName: 'blogPostTags', eventBus: getEventBus() }),
)
const getBlogCategoriesItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.blogCategories, tableName: 'blogCategories', eventBus: getEventBus() }),
)
const getContentCreatorSettingsItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.contentCreatorSettings, tableName: 'contentCreatorSettings', eventBus: getEventBus() }),
)
const getContentCreatorPillarsItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.contentCreatorPillars, tableName: 'contentCreatorPillars', eventBus: getEventBus() }),
)
const getContentCreatorClustersItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.contentCreatorClusters, tableName: 'contentCreatorClusters', eventBus: getEventBus() }),
)
const getFileMetadataItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.fileMetadata, tableName: 'fileMetadata', eventBus: getEventBus() }),
)

// RBAC Service (depends on ItemServices above)
const getRbacService = lazy(() =>
  createRbacService({
    rolesItemService: getRolesItemService(),
    rolePermissionsItemService: getRolePermissionsItemService(),
    userRolesItemService: getUserRolesItemService(),
  }),
)

// Organisation Members Service
const getOrganisationMembersService = lazy(() =>
  createOrganisationMembersService({
    organisationMembersItemService: getOrganisationMembersItemService(),
    usersItemService: getUsersItemService(),
    organisationsItemService: getOrganisationsItemService(),
    rolesItemService: getRolesItemService(),
    rbacService: getRbacService(),
  }),
)

// Profile Service
const getProfileService = lazy(() =>
  createProfileService({
    usersItemService: getUsersItemService(),
    pendingEmailChangesItemService: getPendingEmailChangesItemService(),
    emailService: getEmailService(),
    db: getDatabase('app'),
  }),
)

// Organisations Service
const getOrganisationsService = lazy(() =>
  createOrganisationsService({
    organisationsItemService: getOrganisationsItemService(),
    rolesItemService: getRolesItemService(),
    usersItemService: getUsersItemService(),
    organisationMembersService: getOrganisationMembersService(),
  }),
)

// Organisation Invitations Service
const getOrganisationInvitationsService = lazy(() =>
  createOrganisationInvitationsService({
    organisationInvitationsItemService: getOrganisationInvitationsItemService(),
    organisationsItemService: getOrganisationsItemService(),
    usersItemService: getUsersItemService(),
    rolesItemService: getRolesItemService(),
    emailService: getEmailService(),
    organisationMembersService: getOrganisationMembersService(),
  }),
)

// Image Processing Service
const getImageProcessingService = lazy(() =>
  createImageProcessingService(),
)

// File Service
const getFileService = lazy(() =>
  createFileService({
    fileStoreProvider: getFileStoreProvider(),
    filesItemService: getFilesItemService(),
    config,
  }),
)

// Content Creator Service
const getContentCreatorService = lazy(() =>
  createContentCreatorService({
    settingsItemService: getContentCreatorSettingsItemService(),
    pillarsItemService: getContentCreatorPillarsItemService(),
    clustersItemService: getContentCreatorClustersItemService(),
    blogPostsItemService: getBlogPostsItemService(),
    blogCategoriesItemService: getBlogCategoriesItemService(),
  }),
)

// Media Library Service
const getMediaLibraryService = lazy(() =>
  createMediaLibraryService({
    filesItemService: getFilesItemService(),
    fileMetadataItemService: getFileMetadataItemService(),
    config,
  }),
)

// Public exports
export const container = {
  get authService(): AuthService {
    return getAuthService()
  },
  get authProvidersService(): AuthProvidersService {
    return getAuthProvidersService()
  },
  get emailService(): EmailService {
    return getEmailService()
  },
  get impersonationService(): ImpersonationService {
    return getImpersonationService()
  },
  get rbacService(): RbacService {
    return getRbacService()
  },
  get organisationMembersService(): OrganisationMembersService {
    return getOrganisationMembersService()
  },
  get organisationsService(): OrganisationsService {
    return getOrganisationsService()
  },
  get organisationInvitationsService(): OrganisationInvitationsService {
    return getOrganisationInvitationsService()
  },
  get profileService(): ProfileService {
    return getProfileService()
  },
  get fileService(): FileService {
    return getFileService()
  },
  get imageProcessingService(): ImageProcessingService {
    return getImageProcessingService()
  },
  get contentCreatorService(): ContentCreatorService {
    return getContentCreatorService()
  },
  get mediaLibraryService(): MediaLibraryService {
    return getMediaLibraryService()
  },
  get eventBus(): EventBus {
    return getEventBus()
  },
  items: {
    get users() { return getUsersItemService() },
    get organisations() { return getOrganisationsItemService() },
    get teams() { return getTeamsItemService() },
    get organisationMembers() { return getOrganisationMembersItemService() },
    get teamMembers() { return getTeamMembersItemService() },
    get sessions() { return getSessionsItemService() },
    get passwordResetTokens() { return getPasswordResetTokensItemService() },
    get pendingEmailChanges() { return getPendingEmailChangesItemService() },
    get roles() { return getRolesItemService() },
    get rolePermissions() { return getRolePermissionsItemService() },
    get userRoles() { return getUserRolesItemService() },
    get organisationInvitations() { return getOrganisationInvitationsItemService() },
    get files() { return getFilesItemService() },
    get blogPosts() { return getBlogPostsItemService() },
    get blogTags() { return getBlogTagsItemService() },
    get blogPostTags() { return getBlogPostTagsItemService() },
    get blogCategories() { return getBlogCategoriesItemService() },
    get contentCreatorSettings() { return getContentCreatorSettingsItemService() },
    get contentCreatorPillars() { return getContentCreatorPillarsItemService() },
    get contentCreatorClusters() { return getContentCreatorClustersItemService() },
    get fileMetadata() { return getFileMetadataItemService() },
  },
}
