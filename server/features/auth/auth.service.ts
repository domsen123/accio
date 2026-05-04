import type { Session, User } from '../../database/schema'
import type { DatabaseClient } from '../../infrastructure/database/client'
import type { EventBus } from '../../infrastructure/events'
import type { EmailService } from '../email/email.service'
import crypto from 'node:crypto'
import bcrypt from 'bcrypt'
import { and, desc, eq, gt, isNull, lt, ne } from 'drizzle-orm'
import { ulid } from 'ulid'
import { emailVerificationTokens, passwordResetTokens, sessions, users } from '../../database/schema'
import { config } from '../../utils/config'

const BCRYPT_COST = 12
const SESSION_EXPIRY_SHORT_DAYS = 1
const SESSION_EXPIRY_LONG_DAYS = 30
const SESSION_REFRESH_THRESHOLD_DAYS = 7
const PASSWORD_RESET_TOKEN_EXPIRY_HOURS = 1
const EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS = 24

export interface AuthServiceResult {
  user: Omit<User, 'passwordHash'>
  session: Session
  token: string
}

export interface SessionInfo {
  id: string
  userAgent: string | null
  ipAddress: string | null
  createdAt: Date
  expiresAt: Date
  isCurrent: boolean
}

export interface CreateAuthServiceDeps {
  db: DatabaseClient
  emailService: EmailService
  eventBus?: EventBus
}

export const createAuthService = ({ db, emailService, eventBus }: CreateAuthServiceDeps) => {
  const hashPassword = (password: string): Promise<string> => {
    return bcrypt.hash(password, BCRYPT_COST)
  }

  const verifyPassword = (password: string, hash: string): Promise<boolean> => {
    return bcrypt.compare(password, hash)
  }

  const generateSessionToken = (): string => {
    return crypto.randomBytes(32).toString('hex')
  }

  const omitPasswordHash = (user: User): Omit<User, 'passwordHash'> => {
    const { passwordHash: _, ...safeUser } = user
    return safeUser
  }

  const createSession = async (userId: string, remember: boolean = false, expiryDaysOverride?: number): Promise<{ session: Session, token: string }> => {
    const token = generateSessionToken()
    const expiryDays = expiryDaysOverride ?? (remember ? SESSION_EXPIRY_LONG_DAYS : SESSION_EXPIRY_SHORT_DAYS)
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000)

    const [session] = await db
      .insert(sessions)
      .values({
        id: ulid(),
        userId,
        token,
        expiresAt,
      })
      .returning()

    if (!session) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to create session',
      })
    }

    return { session, token }
  }

  const sendVerificationEmail = async (userId: string): Promise<{ success: boolean }> => {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (!user || !user.email) {
      console.error(`[Email Verification] User not found or has no email: ${userId}`)
      return { success: false }
    }

    if (user.emailVerified) {
      console.log(`[Email Verification] User already verified: ${userId}`)
      return { success: true }
    }

    // Delete any existing verification tokens for this user
    await db
      .delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, userId))

    // Generate new token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000)

    // Store token
    await db
      .insert(emailVerificationTokens)
      .values({
        id: ulid(),
        userId,
        token,
        expiresAt,
      })

    // Send verification email
    const verificationLink = `${config.site.url}/auth/verify-email?token=${token}`

    const result = await emailService.sendEmailVerification(user.email, {
      userName: user.name ?? undefined,
      verificationLink,
      expiresInHours: EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS,
    })

    if (!result.success) {
      console.error(`[Email Verification] Failed to send email to ${user.email}:`, result.error)
      return { success: false }
    }

    console.log(`[Email Verification] Email sent to ${user.email}`)
    return { success: true }
  }

  const createAnonymousUser = async (sessionDurationDays: number): Promise<AuthServiceResult> => {
    const [user] = await db
      .insert(users)
      .values({
        id: ulid(),
        authProvider: 'anonymous',
      })
      .returning()

    if (!user) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to create anonymous user',
      })
    }

    const { session, token } = await createSession(user.id, false, sessionDurationDays)

    return {
      user: omitPasswordHash(user),
      session,
      token,
    }
  }

  interface RegisterOptions {
    /** Skip sending verification email and mark user as verified (for seeding) */
    skipVerification?: boolean
    /** Existing anonymous user ID to upgrade to a full account */
    existingUserId?: string
  }

  const register = async (
    email: string,
    password: string,
    name?: string,
    options?: RegisterOptions,
  ): Promise<AuthServiceResult> => {
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1)

    if (existingUser.length > 0) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Email already exists',
      })
    }

    const hashedPassword = await hashPassword(password)

    let user: User

    if (options?.existingUserId) {
      // Upgrade anonymous user to credentials
      const [existingAnon] = await db
        .select()
        .from(users)
        .where(eq(users.id, options.existingUserId))
        .limit(1)

      if (!existingAnon || existingAnon.authProvider !== 'anonymous') {
        throw createError({
          statusCode: 400,
          statusMessage: 'Invalid user for upgrade',
        })
      }

      const [updated] = await db
        .update(users)
        .set({
          email: email.toLowerCase(),
          passwordHash: hashedPassword,
          name,
          authProvider: 'credentials',
          emailVerified: options?.skipVerification ?? false,
          updatedAt: new Date(),
        })
        .where(eq(users.id, options.existingUserId))
        .returning()

      if (!updated) {
        throw createError({
          statusCode: 500,
          statusMessage: 'Failed to upgrade user',
        })
      }

      user = updated
    }
    else {
      const [created] = await db
        .insert(users)
        .values({
          id: ulid(),
          email: email.toLowerCase(),
          passwordHash: hashedPassword,
          name,
          emailVerified: options?.skipVerification ?? false,
        })
        .returning()

      if (!created) {
        throw createError({
          statusCode: 500,
          statusMessage: 'Failed to create user',
        })
      }

      user = created
    }

    // Emit user registered event for other features (e.g., RBAC role assignment)
    eventBus?.emit('auth:user-registered', {
      userId: user.id,
      email: user.email,
      timestamp: new Date(),
    })

    // For upgrade flow, keep existing session; for new users, create a new one
    if (options?.existingUserId) {
      // Reuse existing session — caller should keep existing cookie
      const existingSessions = await db
        .select()
        .from(sessions)
        .where(eq(sessions.userId, user.id))
        .limit(1)

      const session = existingSessions[0]
      if (!session) {
        // Fallback: create new session if none exists
        const { session: newSession, token } = await createSession(user.id)
        return { user: omitPasswordHash(user), session: newSession, token }
      }

      return {
        user: omitPasswordHash(user),
        session,
        token: session.token,
      }
    }

    const { session, token } = await createSession(user.id)

    // Send verification email unless skipped (don't await to not block registration)
    if (!options?.skipVerification) {
      sendVerificationEmail(user.id).catch((error) => {
        console.error(`[Registration] Failed to send verification email:`, error)
      })
    }

    return {
      user: omitPasswordHash(user),
      session,
      token,
    }
  }

  const login = async (email: string, password: string, remember: boolean = false): Promise<AuthServiceResult> => {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1)

    if (!user || !user.passwordHash) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid credentials',
      })
    }

    const isValid = await verifyPassword(password, user.passwordHash)

    if (!isValid) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid credentials',
      })
    }

    const { session, token } = await createSession(user.id, remember)

    return {
      user: omitPasswordHash(user),
      session,
      token,
    }
  }

  const validateSession = async (
    token: string,
  ): Promise<{ session: Session, user: Omit<User, 'passwordHash'> } | null> => {
    const [result] = await db
      .select()
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
      .limit(1)

    if (!result) {
      return null
    }

    return {
      session: result.sessions,
      user: omitPasswordHash(result.users),
    }
  }

  const invalidateSession = async (token: string): Promise<void> => {
    await db.delete(sessions).where(eq(sessions.token, token))
  }

  const refreshSession = async (sessionId: string): Promise<Session> => {
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_LONG_DAYS * 24 * 60 * 60 * 1000)

    const [session] = await db
      .update(sessions)
      .set({ expiresAt })
      .where(eq(sessions.id, sessionId))
      .returning()

    if (!session) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to refresh session',
      })
    }

    return session
  }

  const shouldRefreshSession = (session: Session): boolean => {
    const daysUntilExpiry = (session.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    return daysUntilExpiry < SESSION_REFRESH_THRESHOLD_DAYS
  }

  const requestPasswordReset = async (email: string): Promise<{ success: boolean }> => {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1)

    // Always return success to prevent email enumeration
    if (!user || !user.email) {
      console.log(`[Password Reset] Email not found: ${email}`)
      return { success: true }
    }

    // Delete any existing reset tokens for this user
    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.id))

    // Generate new token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000)

    // Store token
    await db
      .insert(passwordResetTokens)
      .values({
        id: ulid(),
        userId: user.id,
        token,
        expiresAt,
      })

    // Send password reset email
    const resetLink = `${config.site.url}/auth/reset-password?token=${token}`

    const result = await emailService.sendPasswordReset(user.email, {
      userName: user.name ?? undefined,
      resetLink,
      expiresInHours: PASSWORD_RESET_TOKEN_EXPIRY_HOURS,
    })

    if (!result.success) {
      console.error(`[Password Reset] Failed to send email to ${user.email}:`, result.error)
    }

    return { success: true }
  }

  const validateResetToken = async (
    token: string,
  ): Promise<{ valid: boolean, userId?: string }> => {
    const [resetToken] = await db
      .select()
      .from(passwordResetTokens)
      .where(and(
        eq(passwordResetTokens.token, token),
        gt(passwordResetTokens.expiresAt, new Date()),
      ))
      .limit(1)

    if (!resetToken) {
      return { valid: false }
    }

    return { valid: true, userId: resetToken.userId }
  }

  const resetPassword = async (
    token: string,
    newPassword: string,
  ): Promise<{ success: boolean }> => {
    // Validate token
    const validation = await validateResetToken(token)

    if (!validation.valid || !validation.userId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid or expired reset token',
      })
    }

    // Hash new password
    const passwordHash = await hashPassword(newPassword)

    // Update user password
    await db
      .update(users)
      .set({
        passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, validation.userId))

    // Delete the reset token (single-use)
    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token))

    // Invalidate all existing sessions for security
    await db
      .delete(sessions)
      .where(eq(sessions.userId, validation.userId))

    console.log(`[Password Reset] Password successfully reset for user: ${validation.userId}`)

    return { success: true }
  }

  const cleanupExpiredResetTokens = async (): Promise<number> => {
    const result = await db
      .delete(passwordResetTokens)
      .where(lt(passwordResetTokens.expiresAt, new Date()))
      .returning()

    return result.length
  }

  const verifyEmail = async (token: string): Promise<{ success: boolean, alreadyVerified?: boolean }> => {
    const [verificationToken] = await db
      .select()
      .from(emailVerificationTokens)
      .innerJoin(users, eq(emailVerificationTokens.userId, users.id))
      .where(and(
        eq(emailVerificationTokens.token, token),
        gt(emailVerificationTokens.expiresAt, new Date()),
      ))
      .limit(1)

    if (!verificationToken) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid or expired verification token',
      })
    }

    // Check if already verified
    if (verificationToken.users.emailVerified) {
      // Delete the token since it's no longer needed
      await db
        .delete(emailVerificationTokens)
        .where(eq(emailVerificationTokens.token, token))

      return { success: true, alreadyVerified: true }
    }

    // Mark email as verified
    await db
      .update(users)
      .set({
        emailVerified: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, verificationToken.email_verification_tokens.userId))

    // Delete the verification token (single-use)
    await db
      .delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.token, token))

    console.log(`[Email Verification] Email verified for user: ${verificationToken.email_verification_tokens.userId}`)

    return { success: true }
  }

  const resendVerificationEmail = async (userId: string): Promise<{ success: boolean }> => {
    return sendVerificationEmail(userId)
  }

  const cleanupExpiredVerificationTokens = async (): Promise<number> => {
    const result = await db
      .delete(emailVerificationTokens)
      .where(lt(emailVerificationTokens.expiresAt, new Date()))
      .returning()

    return result.length
  }

  /**
   * Get all active sessions for a user
   */
  const getUserSessions = async (
    userId: string,
    currentSessionId: string,
  ): Promise<SessionInfo[]> => {
    const userSessions = await db
      .select()
      .from(sessions)
      .where(and(
        eq(sessions.userId, userId),
        gt(sessions.expiresAt, new Date()),
        isNull(sessions.impersonatingUserId), // Exclude impersonation sessions
      ))
      .orderBy(desc(sessions.createdAt))

    return userSessions.map(session => ({
      id: session.id,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      isCurrent: session.id === currentSessionId,
    }))
  }

  /**
   * Invalidate all sessions except the current one
   */
  const invalidateOtherSessions = async (
    userId: string,
    currentSessionId: string,
  ): Promise<number> => {
    const result = await db
      .delete(sessions)
      .where(and(
        eq(sessions.userId, userId),
        ne(sessions.id, currentSessionId),
        isNull(sessions.impersonatingUserId), // Don't delete impersonation sessions
      ))
      .returning()

    return result.length
  }

  /**
   * Invalidate a specific session by ID (for revoking individual sessions)
   */
  const invalidateSessionById = async (
    userId: string,
    sessionId: string,
  ): Promise<boolean> => {
    const result = await db
      .delete(sessions)
      .where(and(
        eq(sessions.id, sessionId),
        eq(sessions.userId, userId),
        isNull(sessions.impersonatingUserId), // Don't delete impersonation sessions
      ))
      .returning()

    return result.length > 0
  }

  return {
    register,
    login,
    createAnonymousUser,
    createSession,
    validateSession,
    invalidateSession,
    refreshSession,
    shouldRefreshSession,
    requestPasswordReset,
    validateResetToken,
    resetPassword,
    cleanupExpiredResetTokens,
    sendVerificationEmail,
    verifyEmail,
    resendVerificationEmail,
    cleanupExpiredVerificationTokens,
    getUserSessions,
    invalidateOtherSessions,
    invalidateSessionById,
  }
}

export type AuthService = ReturnType<typeof createAuthService>
