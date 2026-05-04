import type { pendingEmailChanges, users } from '~~/server/database/schema'
import type { DatabaseClient } from '~~/server/infrastructure/database/client'
import type { ItemService } from '~~/server/infrastructure/database/item-service'
import type { EmailService } from '../email/email.service'
import crypto from 'node:crypto'
import bcrypt from 'bcrypt'
import { eq, lt } from 'drizzle-orm'
import { pendingEmailChanges as pendingEmailChangesTable } from '~~/server/database/schema'
import { config } from '~~/server/utils/config'

const BCRYPT_COST = 12
const EMAIL_CHANGE_TOKEN_EXPIRY_HOURS = 24

export interface UserProfile {
  id: string
  email: string | null
  name: string | null
  locale: string
  createdAt: Date
  updatedAt: Date
}

export interface UpdateProfileInput {
  name?: string
  locale?: string
}

export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
}

export interface RequestEmailChangeInput {
  newEmail: string
}

export interface PendingEmailChangeInfo {
  newEmail: string
  expiresAt: Date
}

export interface CreateProfileServiceDeps {
  usersItemService: ItemService<typeof users>
  pendingEmailChangesItemService: ItemService<typeof pendingEmailChanges>
  emailService: EmailService
  db: DatabaseClient
}

export const createProfileService = (deps: CreateProfileServiceDeps) => {
  const { usersItemService, pendingEmailChangesItemService, emailService, db } = deps

  /**
   * Get user profile by ID
   */
  const getProfile = async (userId: string): Promise<UserProfile | null> => {
    const user = await usersItemService.readOne(userId)

    if (!user) {
      return null
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      locale: user.locale,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }
  }

  /**
   * Update user profile (name and locale - email changes require verification)
   */
  const updateProfile = async (
    userId: string,
    input: UpdateProfileInput,
  ): Promise<UserProfile> => {
    const user = await usersItemService.readOne(userId)

    if (!user) {
      throw createError({ statusCode: 404, statusMessage: 'User not found' })
    }

    const updateData: Partial<{ name: string | null, locale: string }> = {}

    if (input.name !== undefined) {
      updateData.name = input.name || null
    }

    if (input.locale !== undefined) {
      updateData.locale = input.locale
    }

    const updatedUser = await usersItemService.update(userId, updateData)

    return {
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      locale: updatedUser.locale,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
    }
  }

  /**
   * Request email change - sends verification to NEW email address
   */
  const requestEmailChange = async (
    userId: string,
    input: RequestEmailChangeInput,
  ): Promise<{ success: boolean, message: string }> => {
    const user = await usersItemService.readOne(userId)

    if (!user) {
      throw createError({ statusCode: 404, statusMessage: 'User not found' })
    }

    const newEmail = input.newEmail.toLowerCase().trim()

    // Check if new email is same as current
    if (newEmail === user.email) {
      throw createError({ statusCode: 400, statusMessage: 'New email must be different from current email' })
    }

    // Check if new email is already in use
    const existingUser = await usersItemService.findOne({ email: newEmail })
    if (existingUser) {
      throw createError({ statusCode: 409, statusMessage: 'Email already in use' })
    }

    // Delete any existing pending email changes for this user
    await db.delete(pendingEmailChangesTable).where(eq(pendingEmailChangesTable.userId, userId))

    // Generate token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + EMAIL_CHANGE_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000)

    // Create pending email change
    await pendingEmailChangesItemService.create({
      userId,
      newEmail,
      token,
      expiresAt,
    })

    // Send confirmation email to NEW email address
    const confirmationLink = `${config.site.url}/auth/confirm-email?token=${token}`

    await emailService.sendEmailChangeConfirmation(newEmail, {
      userName: user.name || undefined,
      confirmationLink,
      expiresInHours: EMAIL_CHANGE_TOKEN_EXPIRY_HOURS,
    })

    return {
      success: true,
      message: 'Verification email sent to your new email address',
    }
  }

  /**
   * Confirm email change with token
   */
  const confirmEmailChange = async (
    token: string,
  ): Promise<{ success: boolean, email: string }> => {
    // Find pending change
    const pendingChange = await pendingEmailChangesItemService.findOne({ token })

    if (!pendingChange) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid or expired token' })
    }

    // Check if token has expired
    if (new Date() > pendingChange.expiresAt) {
      // Clean up expired token
      await pendingEmailChangesItemService.delete(pendingChange.id)
      throw createError({ statusCode: 400, statusMessage: 'Token has expired' })
    }

    // Check if new email is still available (could have been taken since request)
    const existingUser = await usersItemService.findOne({ email: pendingChange.newEmail })
    if (existingUser && existingUser.id !== pendingChange.userId) {
      await pendingEmailChangesItemService.delete(pendingChange.id)
      throw createError({ statusCode: 409, statusMessage: 'Email is no longer available' })
    }

    // Update user email and mark as verified
    await usersItemService.update(pendingChange.userId, {
      email: pendingChange.newEmail,
      emailVerified: true,
    })

    // Delete pending change
    await pendingEmailChangesItemService.delete(pendingChange.id)

    return {
      success: true,
      email: pendingChange.newEmail,
    }
  }

  /**
   * Cancel pending email change
   */
  const cancelEmailChange = async (userId: string): Promise<{ success: boolean }> => {
    await db.delete(pendingEmailChangesTable).where(eq(pendingEmailChangesTable.userId, userId))
    return { success: true }
  }

  /**
   * Get pending email change for user
   */
  const getPendingEmailChange = async (userId: string): Promise<PendingEmailChangeInfo | null> => {
    const pendingChange = await pendingEmailChangesItemService.findOne({ userId })

    if (!pendingChange) {
      return null
    }

    // Check if expired
    if (new Date() > pendingChange.expiresAt) {
      // Clean up expired token
      await pendingEmailChangesItemService.delete(pendingChange.id)
      return null
    }

    return {
      newEmail: pendingChange.newEmail,
      expiresAt: pendingChange.expiresAt,
    }
  }

  /**
   * Cleanup expired pending email changes
   */
  const cleanupExpiredEmailChanges = async (): Promise<number> => {
    const result = await db
      .delete(pendingEmailChangesTable)
      .where(lt(pendingEmailChangesTable.expiresAt, new Date()))
      .returning()

    return result.length
  }

  /**
   * Change user password
   */
  const changePassword = async (
    userId: string,
    input: ChangePasswordInput,
  ): Promise<{ success: boolean }> => {
    const user = await usersItemService.readOne(userId)

    if (!user || !user.passwordHash) {
      throw createError({ statusCode: 404, statusMessage: 'User not found' })
    }

    // Verify current password
    const isValid = await bcrypt.compare(input.currentPassword, user.passwordHash)

    if (!isValid) {
      throw createError({ statusCode: 401, statusMessage: 'Current password is incorrect' })
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(input.newPassword, BCRYPT_COST)

    // Update password
    await usersItemService.update(userId, {
      passwordHash: newPasswordHash,
    })

    return { success: true }
  }

  return {
    getProfile,
    updateProfile,
    changePassword,
    requestEmailChange,
    confirmEmailChange,
    cancelEmailChange,
    getPendingEmailChange,
    cleanupExpiredEmailChanges,
  }
}

export type ProfileService = ReturnType<typeof createProfileService>
