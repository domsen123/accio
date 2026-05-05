import { relations } from 'drizzle-orm'
import { aiModels } from './ai-models'
import { aiProviderCredentials } from './ai-provider-credentials'
import { aiProviders } from './ai-providers'
import { blogCategories } from './blog-categories'
import { blogPostTags } from './blog-post-tags'
import { blogPosts } from './blog-posts'
import { blogTags } from './blog-tags'
import { contentCreatorClusters } from './content-creator-clusters'
import { contentCreatorPillars } from './content-creator-pillars'
import { fileMetadata } from './file-metadata'
import { files } from './files'
import { kbCategories } from './kb-categories'
import { kbEntries } from './kb-entries'
import { kbEntryLinks } from './kb-entry-links'
import { kbEntryTags } from './kb-entry-tags'
import { kbTags } from './kb-tags'
import { orchestratorActions } from './orchestrator-actions'
import { orchestratorConversations } from './orchestrator-conversations'
import { orchestratorMessages } from './orchestrator-messages'
import { orchestratorWorkspaceSettings } from './orchestrator-workspace-settings'
import { organisationInvitations } from './organisation-invitations'
import { organisationMembers } from './organisation-members'
import { organisations } from './organisations'
import { passwordResetTokens } from './password-reset-tokens'
import { pendingEmailChanges } from './pending-email-changes'
import { rolePermissions } from './role-permissions'
import { roles } from './roles'
import { sessions } from './sessions'
import { teamMembers } from './team-members'
import { teams } from './teams'
import { todoKbLinks } from './todo-kb-links'
import { todoTags } from './todo-tags'
import { todos } from './todos'
import { userRoles } from './user-roles'
import { users } from './users'

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  passwordResetTokens: many(passwordResetTokens),
  pendingEmailChanges: many(pendingEmailChanges),
  organisationMemberships: many(organisationMembers),
  teamMemberships: many(teamMembers),
  userRoles: many(userRoles),
  files: many(files),
  blogPosts: many(blogPosts),
  aiProviderCredentials: many(aiProviderCredentials),
  orchestratorConversations: many(orchestratorConversations),
  orchestratorActions: many(orchestratorActions),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}))

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id],
  }),
}))

export const organisationsRelations = relations(organisations, ({ one, many }) => ({
  teams: many(teams),
  members: many(organisationMembers),
  customRoles: many(roles),
  invitations: many(organisationInvitations),
  kbEntries: many(kbEntries),
  kbCategories: many(kbCategories),
  kbTags: many(kbTags),
  todos: many(todos),
  aiProviderCredentials: many(aiProviderCredentials),
  orchestratorConversations: many(orchestratorConversations),
  orchestratorActions: many(orchestratorActions),
  orchestratorWorkspaceSettings: one(orchestratorWorkspaceSettings),
}))

export const organisationInvitationsRelations = relations(organisationInvitations, ({ one }) => ({
  organisation: one(organisations, {
    fields: [organisationInvitations.organisationId],
    references: [organisations.id],
  }),
  role: one(roles, {
    fields: [organisationInvitations.roleId],
    references: [roles.id],
  }),
}))

export const teamsRelations = relations(teams, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [teams.organisationId],
    references: [organisations.id],
  }),
  members: many(teamMembers),
}))

export const organisationMembersRelations = relations(organisationMembers, ({ one }) => ({
  organisation: one(organisations, {
    fields: [organisationMembers.organisationId],
    references: [organisations.id],
  }),
  user: one(users, {
    fields: [organisationMembers.userId],
    references: [users.id],
  }),
}))

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
}))

// RBAC Relations
export const rolesRelations = relations(roles, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [roles.organisationId],
    references: [organisations.id],
  }),
  permissions: many(rolePermissions),
  userRoles: many(userRoles),
}))

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, {
    fields: [rolePermissions.roleId],
    references: [roles.id],
  }),
}))

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
}))

export const pendingEmailChangesRelations = relations(pendingEmailChanges, ({ one }) => ({
  user: one(users, {
    fields: [pendingEmailChanges.userId],
    references: [users.id],
  }),
}))

export const filesRelations = relations(files, ({ one, many }) => ({
  uploader: one(users, {
    fields: [files.uploadedBy],
    references: [users.id],
  }),
  parent: one(files, {
    fields: [files.parentId],
    references: [files.id],
    relationName: 'fileVariants',
  }),
  variants: many(files, {
    relationName: 'fileVariants',
  }),
  metadata: one(fileMetadata),
}))

export const fileMetadataRelations = relations(fileMetadata, ({ one }) => ({
  file: one(files, {
    fields: [fileMetadata.fileId],
    references: [files.id],
  }),
}))

// Blog Relations
export const blogPostsRelations = relations(blogPosts, ({ one, many }) => ({
  author: one(users, {
    fields: [blogPosts.authorId],
    references: [users.id],
  }),
  category: one(blogCategories, {
    fields: [blogPosts.categoryId],
    references: [blogCategories.id],
  }),
  postTags: many(blogPostTags),
}))

export const blogCategoriesRelations = relations(blogCategories, ({ many }) => ({
  posts: many(blogPosts),
  pillars: many(contentCreatorPillars),
}))

export const blogTagsRelations = relations(blogTags, ({ many }) => ({
  postTags: many(blogPostTags),
}))

export const blogPostTagsRelations = relations(blogPostTags, ({ one }) => ({
  post: one(blogPosts, {
    fields: [blogPostTags.postId],
    references: [blogPosts.id],
  }),
  tag: one(blogTags, {
    fields: [blogPostTags.tagId],
    references: [blogTags.id],
  }),
}))

// Content Creator Relations
export const contentCreatorPillarsRelations = relations(contentCreatorPillars, ({ one, many }) => ({
  category: one(blogCategories, {
    fields: [contentCreatorPillars.categoryId],
    references: [blogCategories.id],
  }),
  clusters: many(contentCreatorClusters),
}))

export const contentCreatorClustersRelations = relations(contentCreatorClusters, ({ one }) => ({
  pillar: one(contentCreatorPillars, {
    fields: [contentCreatorClusters.pillarId],
    references: [contentCreatorPillars.id],
  }),
  blogPost: one(blogPosts, {
    fields: [contentCreatorClusters.blogPostId],
    references: [blogPosts.id],
  }),
}))

// KB Relations (DESIGN-DATA §KB)
export const kbEntriesRelations = relations(kbEntries, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [kbEntries.organisationId],
    references: [organisations.id],
  }),
  category: one(kbCategories, {
    fields: [kbEntries.categoryId],
    references: [kbCategories.id],
  }),
  createdByUser: one(users, {
    fields: [kbEntries.createdBy],
    references: [users.id],
  }),
  entryTags: many(kbEntryTags),
  outgoingLinks: many(kbEntryLinks, { relationName: 'fromEntry' }),
  incomingLinks: many(kbEntryLinks, { relationName: 'toEntry' }),
  todoLinks: many(todoKbLinks),
}))

export const kbCategoriesRelations = relations(kbCategories, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [kbCategories.organisationId],
    references: [organisations.id],
  }),
  parent: one(kbCategories, {
    fields: [kbCategories.parentId],
    references: [kbCategories.id],
    relationName: 'kbCategoryTree',
  }),
  children: many(kbCategories, { relationName: 'kbCategoryTree' }),
  entries: many(kbEntries),
}))

export const kbTagsRelations = relations(kbTags, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [kbTags.organisationId],
    references: [organisations.id],
  }),
  entryTags: many(kbEntryTags),
  todoTags: many(todoTags),
}))

export const kbEntryTagsRelations = relations(kbEntryTags, ({ one }) => ({
  entry: one(kbEntries, {
    fields: [kbEntryTags.entryId],
    references: [kbEntries.id],
  }),
  tag: one(kbTags, {
    fields: [kbEntryTags.tagId],
    references: [kbTags.id],
  }),
}))

export const kbEntryLinksRelations = relations(kbEntryLinks, ({ one }) => ({
  organisation: one(organisations, {
    fields: [kbEntryLinks.organisationId],
    references: [organisations.id],
  }),
  fromEntry: one(kbEntries, {
    fields: [kbEntryLinks.fromEntryId],
    references: [kbEntries.id],
    relationName: 'fromEntry',
  }),
  toEntry: one(kbEntries, {
    fields: [kbEntryLinks.toEntryId],
    references: [kbEntries.id],
    relationName: 'toEntry',
  }),
}))

// Todo Relations (DESIGN-DATA §Todo)
export const todosRelations = relations(todos, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [todos.organisationId],
    references: [organisations.id],
  }),
  parent: one(todos, {
    fields: [todos.parentTodoId],
    references: [todos.id],
    relationName: 'todoSubtasks',
  }),
  subtasks: many(todos, { relationName: 'todoSubtasks' }),
  createdByUser: one(users, {
    fields: [todos.createdBy],
    references: [users.id],
  }),
  todoTags: many(todoTags),
  kbLinks: many(todoKbLinks),
}))

export const todoTagsRelations = relations(todoTags, ({ one }) => ({
  todo: one(todos, {
    fields: [todoTags.todoId],
    references: [todos.id],
  }),
  tag: one(kbTags, {
    fields: [todoTags.tagId],
    references: [kbTags.id],
  }),
}))

export const todoKbLinksRelations = relations(todoKbLinks, ({ one }) => ({
  todo: one(todos, {
    fields: [todoKbLinks.todoId],
    references: [todos.id],
  }),
  entry: one(kbEntries, {
    fields: [todoKbLinks.entryId],
    references: [kbEntries.id],
  }),
}))

// AI Provider Relations (DESIGN-DATA §AI Provider)
export const aiProvidersRelations = relations(aiProviders, ({ many }) => ({
  models: many(aiModels),
  credentials: many(aiProviderCredentials),
}))

export const aiModelsRelations = relations(aiModels, ({ one, many }) => ({
  provider: one(aiProviders, {
    fields: [aiModels.providerId],
    references: [aiProviders.id],
  }),
  conversations: many(orchestratorConversations),
  actions: many(orchestratorActions),
  workspaceSettings: many(orchestratorWorkspaceSettings),
}))

export const aiProviderCredentialsRelations = relations(aiProviderCredentials, ({ one }) => ({
  organisation: one(organisations, {
    fields: [aiProviderCredentials.organisationId],
    references: [organisations.id],
  }),
  provider: one(aiProviders, {
    fields: [aiProviderCredentials.providerId],
    references: [aiProviders.id],
  }),
  createdByUser: one(users, {
    fields: [aiProviderCredentials.createdBy],
    references: [users.id],
  }),
}))

// Orchestrator Relations (DESIGN-DATA §Orchestrator)
export const orchestratorConversationsRelations = relations(orchestratorConversations, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [orchestratorConversations.organisationId],
    references: [organisations.id],
  }),
  user: one(users, {
    fields: [orchestratorConversations.userId],
    references: [users.id],
  }),
  model: one(aiModels, {
    fields: [orchestratorConversations.modelId],
    references: [aiModels.id],
  }),
  messages: many(orchestratorMessages),
  actions: many(orchestratorActions),
}))

export const orchestratorMessagesRelations = relations(orchestratorMessages, ({ one, many }) => ({
  conversation: one(orchestratorConversations, {
    fields: [orchestratorMessages.conversationId],
    references: [orchestratorConversations.id],
  }),
  actions: many(orchestratorActions),
}))

export const orchestratorActionsRelations = relations(orchestratorActions, ({ one }) => ({
  organisation: one(organisations, {
    fields: [orchestratorActions.organisationId],
    references: [organisations.id],
  }),
  conversation: one(orchestratorConversations, {
    fields: [orchestratorActions.conversationId],
    references: [orchestratorConversations.id],
  }),
  message: one(orchestratorMessages, {
    fields: [orchestratorActions.messageId],
    references: [orchestratorMessages.id],
  }),
  user: one(users, {
    fields: [orchestratorActions.userId],
    references: [users.id],
  }),
  model: one(aiModels, {
    fields: [orchestratorActions.modelId],
    references: [aiModels.id],
  }),
}))

export const orchestratorWorkspaceSettingsRelations = relations(orchestratorWorkspaceSettings, ({ one }) => ({
  organisation: one(organisations, {
    fields: [orchestratorWorkspaceSettings.organisationId],
    references: [organisations.id],
  }),
  defaultModel: one(aiModels, {
    fields: [orchestratorWorkspaceSettings.defaultModelId],
    references: [aiModels.id],
  }),
}))
