// MCP tool registry helpers (T-3.3 read tools, T-3.4 KB write tools, T-3.5
// todo write tools).
//
// Re-exports each tool factory, plus composite `createReadTools` /
// `createWriteToolsKb` / `createWriteToolsTodo` builders and convenience
// `registerReadTools` / `registerWriteToolsKb` / `registerWriteToolsTodo`
// helpers. The chat handler (T-3.11) will call `registerReadTools` for both
// `read_only` and `read_write` conversations; only `read_write` conversations
// additionally get the write tools.
//
// `createAllTools` is the composite the chat handler will use to assemble the
// per-request registry. Keys are forward-compatible with `projects` (Phase 4)
// — those slots will appear here as their tasks land.

import type { DatabaseClient } from '../../../infrastructure/database/client'
import type { KbCategoryService, KbEntryService, KbTagService } from '../../kb/service'
import type { TodoService } from '../../todo/service'
import type { VaultService } from '../../vault/service'
import type { VaultSessionStore } from '../../vault/session-store'
import type { McpServer, Tool } from '../mcp-server'

import { createKbAddTagTool } from './kb-add-tag'
import { createKbCreateEntryTool } from './kb-create-entry'
import { createKbGetEntryTool } from './kb-get-entry'
import { createKbLinkEntriesTool } from './kb-link-entries'
import { createKbListCategoriesTool } from './kb-list-categories'
import { createKbListTagsTool } from './kb-list-tags'
import { createKbRemoveTagTool } from './kb-remove-tag'
import { createKbSearchTool } from './kb-search'
import { createKbSetStatusTool } from './kb-set-status'
import { createKbSoftDeleteEntryTool } from './kb-soft-delete-entry'
import { createKbUpdateEntryTool } from './kb-update-entry'
import { createProjectListCommitsTool } from './project-list-commits'
import { createProjectListIssuesTool } from './project-list-issues'
import { createProjectListPullsTool } from './project-list-pulls'
import { createProjectListReposTool } from './project-list-repos'
import { createTodoCompleteTool } from './todo-complete'
import { createTodoCreateTool } from './todo-create'
import { createTodoGetTool } from './todo-get'
import { createTodoLinkKbTool } from './todo-link-kb'
import { createTodoSearchTool } from './todo-search'
import { createTodoSoftDeleteTool } from './todo-soft-delete'
import { createTodoUncompleteTool } from './todo-uncomplete'
import { createTodoUnlinkKbTool } from './todo-unlink-kb'
import { createTodoUpdateTool } from './todo-update'
import { createVaultGetSecretTool } from './vault-get-secret'
import { createVaultSearchTool } from './vault-search'

export {
  createKbAddTagTool,
  type KbAddTagInput,
  kbAddTagInputSchema,
  type KbAddTagOutput,
} from './kb-add-tag'
export {
  classifyKbCreateEntry,
  createKbCreateEntryTool,
  type KbCreateEntryInput,
  kbCreateEntryInputSchema,
  type KbCreateEntryOutput,
} from './kb-create-entry'
export {
  createKbGetEntryTool,
  type KbGetEntryInput,
  kbGetEntryInputSchema,
  type KbGetEntryOutput,
} from './kb-get-entry'
export {
  createKbLinkEntriesTool,
  type KbLinkEntriesInput,
  kbLinkEntriesInputSchema,
  type KbLinkEntriesOutput,
} from './kb-link-entries'
export {
  createKbListCategoriesTool,
  type KbCategoryNode,
  type KbListCategoriesInput,
  kbListCategoriesInputSchema,
  type KbListCategoriesOutput,
} from './kb-list-categories'
export {
  createKbListTagsTool,
  type KbListTagsInput,
  kbListTagsInputSchema,
  type KbListTagsOutput,
  type KbTagSummary,
} from './kb-list-tags'
export {
  createKbRemoveTagTool,
  type KbRemoveTagInput,
  kbRemoveTagInputSchema,
  type KbRemoveTagOutput,
} from './kb-remove-tag'
export {
  createKbSearchTool,
  type KbSearchInput,
  kbSearchInputSchema,
  type KbSearchOutput,
  type KbSearchResultItem,
} from './kb-search'
export {
  createKbSetStatusTool,
  type KbSetStatusInput,
  kbSetStatusInputSchema,
  type KbSetStatusOutput,
} from './kb-set-status'
export {
  createKbSoftDeleteEntryTool,
  type KbSoftDeleteEntryInput,
  kbSoftDeleteEntryInputSchema,
  type KbSoftDeleteEntryOutput,
} from './kb-soft-delete-entry'
export {
  createKbUpdateEntryTool,
  type KbUpdateEntryInput,
  kbUpdateEntryInputSchema,
  type KbUpdateEntryOutput,
} from './kb-update-entry'
export {
  createProjectListCommitsTool,
  type ProjectListCommitsInput,
  projectListCommitsInputSchema,
  type ProjectListCommitsItem,
  type ProjectListCommitsOutput,
} from './project-list-commits'
export {
  createProjectListIssuesTool,
  type ProjectListIssuesInput,
  projectListIssuesInputSchema,
  type ProjectListIssuesItem,
  type ProjectListIssuesOutput,
} from './project-list-issues'
export {
  createProjectListPullsTool,
  type ProjectListPullsInput,
  projectListPullsInputSchema,
  type ProjectListPullsItem,
  type ProjectListPullsOutput,
} from './project-list-pulls'
export {
  createProjectListReposTool,
  type ProjectListReposInput,
  projectListReposInputSchema,
  type ProjectListReposItem,
  type ProjectListReposOutput,
} from './project-list-repos'
export {
  createTodoCompleteTool,
  type TodoCompleteInput,
  todoCompleteInputSchema,
  type TodoCompleteOutput,
} from './todo-complete'
export {
  createTodoCreateTool,
  type TodoCreateInput,
  todoCreateInputSchema,
  type TodoCreateOutput,
} from './todo-create'
export {
  createTodoGetTool,
  type TodoGetInput,
  todoGetInputSchema,
  type TodoGetOutput,
  type TodoLinkedKbSummary,
  type TodoSubtaskSummary,
} from './todo-get'
export {
  createTodoLinkKbTool,
  type TodoLinkKbInput,
  todoLinkKbInputSchema,
  type TodoLinkKbOutput,
} from './todo-link-kb'
export {
  createTodoSearchTool,
  type TodoSearchInput,
  todoSearchInputSchema,
  type TodoSearchOutput,
  type TodoSearchResultItem,
} from './todo-search'
export {
  createTodoSoftDeleteTool,
  type TodoSoftDeleteInput,
  todoSoftDeleteInputSchema,
  type TodoSoftDeleteOutput,
} from './todo-soft-delete'
export {
  createTodoUncompleteTool,
  type TodoUncompleteInput,
  todoUncompleteInputSchema,
  type TodoUncompleteOutput,
} from './todo-uncomplete'
export {
  createTodoUnlinkKbTool,
  type TodoUnlinkKbInput,
  todoUnlinkKbInputSchema,
  type TodoUnlinkKbOutput,
} from './todo-unlink-kb'
export {
  createTodoUpdateTool,
  type TodoUpdateInput,
  todoUpdateInputSchema,
  type TodoUpdateOutput,
} from './todo-update'
export {
  createVaultGetSecretTool,
  type VaultGetSecretInput,
  vaultGetSecretInputSchema,
  type VaultGetSecretOutput,
} from './vault-get-secret'
export {
  createVaultSearchTool,
  type VaultSearchInput,
  vaultSearchInputSchema,
  type VaultSearchOutput,
  type VaultSearchResultItem,
} from './vault-search'

export interface ReadToolDeps {
  kbEntryService: KbEntryService
  kbCategoryService: KbCategoryService
  kbTagService: KbTagService
  todoService: TodoService
  /**
   * Drizzle handle used by the project read tools (T-4.7) to query the cached
   * `gh_*` tables. T-4.6 had not landed a `ghProjectsReadService` at the time
   * this task shipped, so the tools query Drizzle directly. If a service does
   * arrive later, this field can be replaced without changing the tool
   * signatures.
   */
  db: DatabaseClient
}

export interface WriteToolKbDeps {
  kbEntryService: KbEntryService
  kbCategoryService: KbCategoryService
  kbTagService: KbTagService
}

export interface WriteToolTodoDeps {
  todoService: TodoService
  /** Required for KB slug-or-id resolution in `todo_create` / `todo_link_kb` / `todo_unlink_kb`. */
  kbEntryService: KbEntryService
}

export interface VaultToolsDeps {
  vaultService: VaultService
  vaultSessionStore: VaultSessionStore
}

/**
 * Combined dep set for `createAllTools`. As future write/project slots arrive
 * (Phase 4 projects) they'll add their service deps here.
 */
export interface AllToolDeps extends ReadToolDeps, WriteToolKbDeps, WriteToolTodoDeps {}

/**
 * Build the vault read tool set. `vault_get_secret` is included but the
 * caller (chat-handler) is responsible for the conditional registration
 * gate on `vault:orchestrator:reveal` per REQ-VAULT-15. Use the dedicated
 * `createVaultRevealTool` factory to opt into reveal separately.
 */
export const createVaultReadTools = (deps: VaultToolsDeps): Tool[] => [
  createVaultSearchTool({
    vaultService: deps.vaultService,
    vaultSessionStore: deps.vaultSessionStore,
  }) as unknown as Tool,
]

export const createVaultRevealTool = (deps: VaultToolsDeps): Tool =>
  createVaultGetSecretTool({
    vaultService: deps.vaultService,
    vaultSessionStore: deps.vaultSessionStore,
  }) as unknown as Tool

export const registerVaultReadTools = (server: McpServer, deps: VaultToolsDeps): void => {
  for (const tool of createVaultReadTools(deps))
    server.register(tool)
}

export const registerVaultRevealTool = (server: McpServer, deps: VaultToolsDeps): void => {
  server.register(createVaultRevealTool(deps))
}

/**
 * Build every read tool against the supplied service deps. Returned in a
 * stable order so the chat handler / tests can iterate deterministically.
 *
 * Each factory returns a `Tool<I, O>` with concrete input/output generics; the
 * registry stores them as `Tool<unknown, unknown>` (`Tool` with default
 * params) and re-narrows via the schema at invoke time. We cast each tool
 * through `unknown` here for the same reason `register` does — see
 * `mcp-server.ts` for the rationale.
 */
export const createReadTools = (deps: ReadToolDeps): Tool[] => [
  createKbSearchTool({
    kbEntryService: deps.kbEntryService,
    kbCategoryService: deps.kbCategoryService,
    kbTagService: deps.kbTagService,
  }) as unknown as Tool,
  createKbGetEntryTool({ kbEntryService: deps.kbEntryService }) as unknown as Tool,
  createKbListCategoriesTool({ kbCategoryService: deps.kbCategoryService }) as unknown as Tool,
  createKbListTagsTool({ kbTagService: deps.kbTagService }) as unknown as Tool,
  createTodoSearchTool({
    todoService: deps.todoService,
    kbEntryService: deps.kbEntryService,
    kbTagService: deps.kbTagService,
  }) as unknown as Tool,
  createTodoGetTool({ todoService: deps.todoService }) as unknown as Tool,
  createProjectListReposTool({ db: deps.db }) as unknown as Tool,
  createProjectListIssuesTool({ db: deps.db }) as unknown as Tool,
  createProjectListPullsTool({ db: deps.db }) as unknown as Tool,
  createProjectListCommitsTool({ db: deps.db }) as unknown as Tool,
]

/**
 * Build every KB write tool (T-3.4) against the supplied service deps. Stable
 * order matches DESIGN-TOOLS §Write KB.
 */
export const createWriteToolsKb = (deps: WriteToolKbDeps): Tool[] => [
  createKbCreateEntryTool({
    kbEntryService: deps.kbEntryService,
    kbCategoryService: deps.kbCategoryService,
  }) as unknown as Tool,
  createKbUpdateEntryTool({
    kbEntryService: deps.kbEntryService,
    kbCategoryService: deps.kbCategoryService,
  }) as unknown as Tool,
  createKbSetStatusTool({ kbEntryService: deps.kbEntryService }) as unknown as Tool,
  createKbAddTagTool({
    kbEntryService: deps.kbEntryService,
    kbTagService: deps.kbTagService,
  }) as unknown as Tool,
  createKbRemoveTagTool({
    kbEntryService: deps.kbEntryService,
    kbTagService: deps.kbTagService,
  }) as unknown as Tool,
  createKbLinkEntriesTool({ kbEntryService: deps.kbEntryService }) as unknown as Tool,
  createKbSoftDeleteEntryTool({ kbEntryService: deps.kbEntryService }) as unknown as Tool,
]

/**
 * Build every Todo write tool (T-3.5) against the supplied service deps.
 * Stable order matches DESIGN-TOOLS §Write Todos.
 */
export const createWriteToolsTodo = (deps: WriteToolTodoDeps): Tool[] => [
  createTodoCreateTool({
    todoService: deps.todoService,
    kbEntryService: deps.kbEntryService,
  }) as unknown as Tool,
  createTodoUpdateTool({ todoService: deps.todoService }) as unknown as Tool,
  createTodoCompleteTool({ todoService: deps.todoService }) as unknown as Tool,
  createTodoUncompleteTool({ todoService: deps.todoService }) as unknown as Tool,
  createTodoSoftDeleteTool({ todoService: deps.todoService }) as unknown as Tool,
  createTodoLinkKbTool({
    todoService: deps.todoService,
    kbEntryService: deps.kbEntryService,
  }) as unknown as Tool,
  createTodoUnlinkKbTool({
    todoService: deps.todoService,
    kbEntryService: deps.kbEntryService,
  }) as unknown as Tool,
]

/**
 * Register every read tool into the supplied registry. Convenience for the
 * chat handler — equivalent to calling `register` on each item from
 * `createReadTools`.
 */
export const registerReadTools = (server: McpServer, deps: ReadToolDeps): void => {
  for (const tool of createReadTools(deps))
    server.register(tool)
}

/**
 * Register every KB write tool into the supplied registry. T-3.11 will call
 * this for `read_write` conversations only.
 */
export const registerWriteToolsKb = (server: McpServer, deps: WriteToolKbDeps): void => {
  for (const tool of createWriteToolsKb(deps))
    server.register(tool)
}

/**
 * Register every Todo write tool into the supplied registry. T-3.11 will call
 * this for `read_write` conversations only.
 */
export const registerWriteToolsTodo = (server: McpServer, deps: WriteToolTodoDeps): void => {
  for (const tool of createWriteToolsTodo(deps))
    server.register(tool)
}

/**
 * Composite builder used by the chat handler (T-3.11). Returns each tool set
 * keyed by slice so the handler can decide which to register based on
 * conversation mode. Forward-compatible with `projects` (Phase 4) — that key
 * will appear here as its task lands.
 */
export const createAllTools = (deps: AllToolDeps): {
  read: Tool[]
  writeKb: Tool[]
  writeTodos: Tool[]
} => ({
  read: createReadTools(deps),
  writeKb: createWriteToolsKb(deps),
  writeTodos: createWriteToolsTodo(deps),
})
