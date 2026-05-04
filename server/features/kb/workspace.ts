/**
 * Resolve the active workspace (organisation) for a KB API request.
 *
 * Resolution order (DESIGN-API §KB, DESIGN-ROUTES §Workspace context resolution):
 *   1. Explicit `X-Organisation-Id` request header.
 *   2. `organisationId` query parameter (handy for browser navigation).
 *   3. Fallback: the user's first organisation membership, sorted by
 *      `createdAt asc`. This is a temporary fallback — once the workspace
 *      switcher persists the active workspace on the session (T-A.x), we
 *      switch to reading it from there and drop this branch.
 *
 * In all cases the resolver verifies that the caller is a member of the
 * resolved organisation. Non-members get 403 (`workspace.access_denied`)
 * rather than 404 so we don't leak organisation existence.
 */
import type { H3Event } from 'h3'
import { container } from '~~/server/utils/container'

export interface WorkspaceContext {
  organisationId: string
  userId: string
}

const HEADER_NAME = 'x-organisation-id'

export const resolveWorkspace = async (event: H3Event): Promise<WorkspaceContext> => {
  const user = event.context.user
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'auth.unauthenticated',
    })
  }

  const headerValue = getRequestHeader(event, HEADER_NAME)?.trim()
  const queryValue = (getQuery(event).organisationId as string | undefined)?.trim()
  const requested = headerValue || queryValue || null

  let organisationId: string | null = requested

  if (!organisationId) {
    // Fallback: pick the user's earliest organisation membership.
    const memberships = await container.items.organisationMembers.findMany({
      filter: { userId: { _eq: user.id } },
      sort: ['createdAt'],
      limit: 1,
    })
    if (memberships.length === 0) {
      throw createError({
        statusCode: 403,
        statusMessage: 'workspace.no_membership',
      })
    }
    organisationId = memberships[0]!.organisationId
  }
  else {
    // Validate membership for explicit selection.
    const member = await container.items.organisationMembers.findOne({
      organisationId: { _eq: organisationId },
      userId: { _eq: user.id },
    })
    if (!member) {
      throw createError({
        statusCode: 403,
        statusMessage: 'workspace.access_denied',
      })
    }
  }

  return {
    organisationId,
    userId: user.id,
  }
}
