import type { Session } from '../../database/schema'
import type { DatabaseClient } from '../../infrastructure/database/client'
import crypto from 'node:crypto'
import { eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import { sessions, users } from '../../database/schema'

const IMPERSONATION_SESSION_HOURS = 4

export interface CreateImpersonationServiceDeps {
  db: DatabaseClient
}

export const createImpersonationService = ({ db }: CreateImpersonationServiceDeps) => {
  const generateSessionToken = (): string => {
    return crypto.randomBytes(32).toString('hex')
  }

  const startImpersonation = async (
    adminUserId: string,
    adminSessionId: string,
    targetUserId: string,
  ): Promise<{ session: Session, token: string }> => {
    // Verify target user exists
    const [targetUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1)

    if (!targetUser) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found',
      })
    }

    // Prevent impersonating yourself
    if (targetUserId === adminUserId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Cannot impersonate yourself',
      })
    }

    // Generate new session token
    const token = generateSessionToken()
    const expiresAt = new Date(Date.now() + IMPERSONATION_SESSION_HOURS * 60 * 60 * 1000)

    // Create impersonation session
    const [session] = await db
      .insert(sessions)
      .values({
        id: ulid(),
        userId: targetUserId,
        token,
        expiresAt,
        impersonatingUserId: adminUserId,
        originalSessionId: adminSessionId,
      })
      .returning()

    if (!session) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to create impersonation session',
      })
    }

    return { session, token }
  }

  const stopImpersonation = async (
    impersonationSessionId: string,
  ): Promise<{ originalSessionId: string } | null> => {
    // Get the impersonation session
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, impersonationSessionId))
      .limit(1)

    if (!session || !session.originalSessionId) {
      return null
    }

    const originalSessionId = session.originalSessionId

    // Delete the impersonation session
    await db.delete(sessions).where(eq(sessions.id, impersonationSessionId))

    return { originalSessionId }
  }

  const getSessionById = async (sessionId: string): Promise<Session | null> => {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1)

    return session ?? null
  }

  return {
    startImpersonation,
    stopImpersonation,
    getSessionById,
  }
}

export type ImpersonationService = ReturnType<typeof createImpersonationService>
