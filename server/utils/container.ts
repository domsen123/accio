import type { ImpersonationService } from '../features/admin/impersonation.service'
import type { AiProviderService } from '../features/ai/provider'
import type { AuthProvidersService } from '../features/auth/auth-providers.service'
import type { AuthService } from '../features/auth/auth.service'
import type { ContentCreatorService } from '../features/content-creator/content-creator.service'
import type { EmailProvider } from '../features/email/email-provider.interface'
import type { EmailService } from '../features/email/email.service'
import type { FileStoreProvider } from '../features/files/file-store-provider.interface'
import type { FileService } from '../features/files/files.service'
import type { ImageProcessingService } from '../features/files/image-processing.service'
import type { MediaLibraryService } from '../features/files/media-library.service'
import type { KbCategoryService, KbEntryService, KbTagService } from '../features/kb/service'
import type { OrchestratorAiClient } from '../features/orchestrator/ai-client'
import type { AuditService } from '../features/orchestrator/audit'
import type { ConversationsService } from '../features/orchestrator/conversations.service'
import type { McpServer } from '../features/orchestrator/mcp-server'
import type { MessagesService } from '../features/orchestrator/messages.service'
import type { OrganisationInvitationsService } from '../features/organisation-invitations/organisation-invitations.service'
import type { OrganisationMembersService } from '../features/organisation-members/organisation-members.service'
import type { OrganisationsService } from '../features/organisations/organisations.service'
import type { ProfileService } from '../features/profile/profile.service'
import type { GhConnectionsService } from '../features/projects/connections.service'
import type { GhClientService, OctokitFactory as GhOctokitFactory } from '../features/projects/github-client'
import type { GhProjectsReadService } from '../features/projects/read.service'
import type { GhSyncService } from '../features/projects/sync.service'
import type { RbacService } from '../features/rbac/rbac.service'
import type { TodoService } from '../features/todo/service'
import type { VaultService } from '../features/vault/service'
import type { VaultSessionStore } from '../features/vault/session-store'
import type { EventBus } from '../infrastructure/events'
import * as schema from '../database/schema'
import { createImpersonationService } from '../features/admin/impersonation.service'
import { createAiProviderService } from '../features/ai/provider'
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
import { createKbCategoryService, createKbEntryService, createKbTagService } from '../features/kb/service'
import { createOrchestratorAiClient } from '../features/orchestrator/ai-client'
import { createAuditService } from '../features/orchestrator/audit'
import { createConversationsService } from '../features/orchestrator/conversations.service'
import { createMcpServer } from '../features/orchestrator/mcp-server'
import { createMessagesService } from '../features/orchestrator/messages.service'
import { createOrganisationInvitationsService } from '../features/organisation-invitations/organisation-invitations.service'
import { createOrganisationMembersService } from '../features/organisation-members/organisation-members.service'
import { createOrganisationsService } from '../features/organisations/organisations.service'
import { createProfileService } from '../features/profile/profile.service'
import { createGhConnectionsService } from '../features/projects/connections.service'
import { createGhClientService } from '../features/projects/github-client'
import { createGhProjectsReadService } from '../features/projects/read.service'
import { createGhSyncService } from '../features/projects/sync.service'
import { createRbacService } from '../features/rbac/rbac.service'
import { createTodoService } from '../features/todo/service'
import { createVaultService } from '../features/vault/service'
import { createVaultSessionStore } from '../features/vault/session-store'
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
const getKbEntriesItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.kbEntries, tableName: 'kbEntries', eventBus: getEventBus() }),
)
const getKbCategoriesItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.kbCategories, tableName: 'kbCategories', eventBus: getEventBus() }),
)
const getKbTagsItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.kbTags, tableName: 'kbTags', eventBus: getEventBus() }),
)
const getKbEntryTagsItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.kbEntryTags, tableName: 'kbEntryTags', eventBus: getEventBus() }),
)
const getTodosItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.todos, tableName: 'todos', eventBus: getEventBus() }),
)
const getTodoTagsItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.todoTags, tableName: 'todoTags', eventBus: getEventBus() }),
)
const getTodoKbLinksItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.todoKbLinks, tableName: 'todoKbLinks', eventBus: getEventBus() }),
)
const getUserVaultCredentialsItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.userVaultCredentials, tableName: 'userVaultCredentials', eventBus: getEventBus() }),
)
const getWorkspaceVaultKeysItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.workspaceVaultKeys, tableName: 'workspaceVaultKeys', eventBus: getEventBus() }),
)
const getVaultFoldersItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.vaultFolders, tableName: 'vaultFolders', eventBus: getEventBus() }),
)
const getVaultEntriesItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.vaultEntries, tableName: 'vaultEntries', eventBus: getEventBus() }),
)
const getVaultTagsItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.vaultTags, tableName: 'vaultTags', eventBus: getEventBus() }),
)
const getVaultEntryTagsItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.vaultEntryTags, tableName: 'vaultEntryTags', eventBus: getEventBus() }),
)
const getVaultAccessLogItemService = lazy(() =>
  createItemService({ db: getDatabase('app'), table: schema.vaultAccessLog, tableName: 'vaultAccessLog', eventBus: getEventBus() }),
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

// KB Services (T-1.2)
const getKbCategoryService = lazy(() =>
  createKbCategoryService({
    kbCategoriesItemService: getKbCategoriesItemService(),
  }),
)

const getKbTagService = lazy(() =>
  createKbTagService({
    db: getDatabase('app'),
    kbTagsItemService: getKbTagsItemService(),
  }),
)

const getKbEntryService = lazy(() =>
  createKbEntryService({
    db: getDatabase('app'),
    kbEntriesItemService: getKbEntriesItemService(),
    kbTagService: getKbTagService(),
  }),
)

// Todo Service (T-2.2)
const getTodoService = lazy(() =>
  createTodoService({
    db: getDatabase('app'),
    todosItemService: getTodosItemService(),
    kbTagService: getKbTagService(),
  }),
)

// AI Provider Service (T-3.1d) — resolves a model_id + workspace into a fresh
// AI SDK client. No request-level caching: see DESIGN-AI §Provider-Model
// resolution flow.
const getAiProviderService = lazy(() =>
  createAiProviderService({
    db: getDatabase('app'),
  }),
)

// Orchestrator Audit Service (T-3.7) — writes `orchestrator_actions` rows for
// every executed write tool (REQ-ORCH-6). The chat handler (T-3.11) and
// confirm/cancel endpoints (T-3.12) consume this; `auditedInvoke` lives next
// to the service in `server/features/orchestrator/audit.ts`.
const getAuditService = lazy(() =>
  createAuditService({
    db: getDatabase('app'),
  }),
)

// Orchestrator Conversations Service (T-3.9) — workspace-scoped CRUD over
// `orchestrator_conversations`. Mode toggle (REQ-ORCH-3) and modelId capability
// validation (DESIGN-AI) live here; the streaming endpoint (T-3.11) and
// confirm/cancel endpoints (T-3.12) consume the get/update surface.
const getConversationsService = lazy(() =>
  createConversationsService({
    db: getDatabase('app'),
  }),
)

// Orchestrator Messages Service (T-3.11) — append/load history for
// `orchestrator_messages`. Used by the chat handler to persist user,
// assistant, and tool_result rows.
const getMessagesService = lazy(() =>
  createMessagesService({ db: getDatabase('app') }),
)

// Orchestrator AI Client (T-3.10) — resolves a conversation's model + author
// name and streams via `streamText` with the in-process MCP tool set wired up
// per conversation mode.
//
// NOTE(T-3.11): the chat handler builds its own per-request registry + ai-client
// inside `chat-handler.ts` because the tool set depends on conversation mode
// (REQ-ORCH-3). The singleton below is kept for backwards compatibility with
// callers that resolve it from the container, but its registry is empty;
// production code should not invoke `streamChat` on it.
const getOrchestratorMcpServer = lazy((): McpServer => createMcpServer())

const getOrchestratorAiClient = lazy(() =>
  createOrchestratorAiClient({
    aiProviderService: getAiProviderService(),
    conversationsService: getConversationsService(),
    mcpServer: getOrchestratorMcpServer(),
  }),
)

// GitHub Octokit factory hub (T-4.2 / T-4.3) — single seam for both the
// connections service (validate-on-save against `GET /user`) and the client
// wrapper (high-level helpers used by the sync service). The two services
// declare their own minimal `OctokitLike` shapes (each describes only the
// SDK methods it actually calls), so the typed factories aren't structurally
// compatible — but the underlying production factory is the same
// `@octokit/rest` default. The hub returns `undefined` for both, which makes
// each service fall through to its internal default. Tests inject the
// factory directly into the service under test.
const getGhOctokitFactory = lazy((): GhOctokitFactory | undefined => undefined)

// GitHub Connections Service (T-4.2) — owns the per-workspace PAT lifecycle
// (encrypted at rest with `encryptForOrg`, validated against `GET /user` on
// save). The T-4.3 GitHub client wrapper consumes the decrypted token via
// `getConnectionContext`.
const getGhConnectionsService = lazy(() =>
  createGhConnectionsService({
    db: getDatabase('app'),
    // octokitFactory omitted — each service has its own default
    // `@octokit/rest` factory; see hub note above.
  }),
)

// GitHub API Client Service (T-4.3) — given an organisationId, resolves the
// workspace PAT via `ghConnectionsService.getConnectionContext` and returns
// a configured Octokit client. Also exposes high-level helpers
// (listAccessibleRepos, getRepo, listIssues, listPulls, listCommits) that
// hide pagination + return normalised snapshot shapes. T-4.4's sync service
// is the primary consumer.
const getGhClientService = lazy(() =>
  createGhClientService({
    db: getDatabase('app'),
    ghConnectionsService: getGhConnectionsService(),
    octokitFactory: getGhOctokitFactory(),
  }),
)

// GitHub Sync Service (T-4.4) — orchestrates pulling repo metadata + open
// issues + open PRs + last 50 commits via `ghClientService` and upserting
// into the `gh_*` cache tables. Surface used by the manual "Sync now" UI
// button (REQ-PROJ-3) and by the scheduled job (T-4.5).
const getGhSyncService = lazy(() =>
  createGhSyncService({
    db: getDatabase('app'),
    ghClientService: getGhClientService(),
    ghConnectionsService: getGhConnectionsService(),
  }),
)

// GitHub Projects Read Service (T-4.6) — read-only accessors over the cached
// `gh_repos`, `gh_issues`, `gh_pulls`, `gh_commits` tables for the API
// surface. Pure DB queries, no upstream GitHub calls; complements the sync
// service.
const getGhProjectsReadService = lazy(() =>
  createGhProjectsReadService({
    db: getDatabase('app'),
  }),
)

// Vault session store (T-V-6) — process-wide map of unlocked vault sessions
// keyed by `(userId, sessionId)`. Lazy so test harnesses can stub it; the
// Nitro plugin starts the periodic sweep timer.
const getVaultSessionStore = lazy((): VaultSessionStore => createVaultSessionStore())

// Vault service (T-V-14) — entry/folder/tag CRUD with on-demand DEK
// unwrapping. Methods that touch ciphertext take a `masterKey` from the
// session store and zero the DEK before returning.
const getVaultService = lazy(() =>
  createVaultService({
    db: getDatabase('app'),
    vaultEntriesItemService: getVaultEntriesItemService(),
    vaultFoldersItemService: getVaultFoldersItemService(),
    vaultTagsItemService: getVaultTagsItemService(),
    workspaceVaultKeysItemService: getWorkspaceVaultKeysItemService(),
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
  get kbCategoryService(): KbCategoryService {
    return getKbCategoryService()
  },
  get kbTagService(): KbTagService {
    return getKbTagService()
  },
  get kbEntryService(): KbEntryService {
    return getKbEntryService()
  },
  get todoService(): TodoService {
    return getTodoService()
  },
  get aiProviderService(): AiProviderService {
    return getAiProviderService()
  },
  get auditService(): AuditService {
    return getAuditService()
  },
  get conversationsService(): ConversationsService {
    return getConversationsService()
  },
  get messagesService(): MessagesService {
    return getMessagesService()
  },
  get orchestratorAiClient(): OrchestratorAiClient {
    return getOrchestratorAiClient()
  },
  get ghConnectionsService(): GhConnectionsService {
    return getGhConnectionsService()
  },
  get ghClientService(): GhClientService {
    return getGhClientService()
  },
  get ghSyncService(): GhSyncService {
    return getGhSyncService()
  },
  get ghProjectsReadService(): GhProjectsReadService {
    return getGhProjectsReadService()
  },
  get vaultSessionStore(): VaultSessionStore {
    return getVaultSessionStore()
  },
  get vaultService(): VaultService {
    return getVaultService()
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
    get kbEntries() { return getKbEntriesItemService() },
    get kbCategories() { return getKbCategoriesItemService() },
    get kbTags() { return getKbTagsItemService() },
    get kbEntryTags() { return getKbEntryTagsItemService() },
    get todos() { return getTodosItemService() },
    get todoTags() { return getTodoTagsItemService() },
    get todoKbLinks() { return getTodoKbLinksItemService() },
    get userVaultCredentials() { return getUserVaultCredentialsItemService() },
    get workspaceVaultKeys() { return getWorkspaceVaultKeysItemService() },
    get vaultFolders() { return getVaultFoldersItemService() },
    get vaultEntries() { return getVaultEntriesItemService() },
    get vaultTags() { return getVaultTagsItemService() },
    get vaultEntryTags() { return getVaultEntryTagsItemService() },
    get vaultAccessLog() { return getVaultAccessLogItemService() },
  },
}
