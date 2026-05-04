import type { organisationInvitations, organisations, roles, users } from '~~/server/database/schema'
import type { EmailService } from '~~/server/features/email/email.service'
import type { OrganisationMembersService } from '~~/server/features/organisation-members/organisation-members.service'
import type { ItemService } from '~~/server/infrastructure/database/item-service'
import crypto from 'node:crypto'
import bcrypt from 'bcrypt'
import { config } from '~~/server/utils/config'

const INVITATION_EXPIRY_DAYS = 7
const BCRYPT_COST = 12

export interface CreateOrganisationInvitationsServiceDeps {
  organisationInvitationsItemService: ItemService<typeof organisationInvitations>
  organisationsItemService: ItemService<typeof organisations>
  usersItemService: ItemService<typeof users>
  rolesItemService: ItemService<typeof roles>
  emailService: EmailService
  organisationMembersService: OrganisationMembersService
}

export interface CreateInvitationInput {
  organisationId: string
  email: string
  roleId: string
  invitedByUserId: string
  inviterName?: string
  deliveryMethod?: 'email' | 'link'
}

export interface AcceptInvitationInput {
  token: string
  password: string
  name?: string
}

export interface AcceptInvitationResult {
  user: { id: string, email: string | null, name: string | null }
  organisationId: string
  organisationName: string
}

export const createOrganisationInvitationsService = (deps: CreateOrganisationInvitationsServiceDeps) => {
  const {
    organisationInvitationsItemService,
    organisationsItemService,
    usersItemService,
    rolesItemService,
    emailService,
    organisationMembersService,
  } = deps

  /**
   * Create an invitation for a non-existing user to join an organisation
   */
  const createInvitation = async (input: CreateInvitationInput): Promise<{ success: boolean, invitationLink?: string }> => {
    const { organisationId, email, roleId, invitedByUserId, inviterName, deliveryMethod = 'email' } = input
    const normalizedEmail = email.toLowerCase().trim()

    // Verify organisation exists
    const org = await organisationsItemService.readOne(organisationId)
    if (!org) {
      throw createError({ statusCode: 404, statusMessage: 'Organisation not found' })
    }

    // Verify role exists and is org-scoped
    const role = await rolesItemService.readOne(roleId)
    if (!role || role.scope !== 'organisation') {
      throw createError({ statusCode: 400, statusMessage: 'Invalid role' })
    }

    // Check if user already exists
    const existingUser = await usersItemService.findOne({ email: normalizedEmail })
    if (existingUser) {
      throw createError({
        statusCode: 400,
        statusMessage: 'User already exists. Use the add member feature instead.',
      })
    }

    // Check for existing invitation (delete if expired)
    const existingInvitation = await organisationInvitationsItemService.findOne({
      email: normalizedEmail,
      organisationId,
    })

    if (existingInvitation) {
      if (new Date(existingInvitation.expiresAt) > new Date()) {
        throw createError({
          statusCode: 409,
          statusMessage: 'An invitation has already been sent to this email',
        })
      }
      // Delete expired invitation
      await organisationInvitationsItemService.delete(existingInvitation.id)
    }

    // Generate token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

    // Create invitation
    await organisationInvitationsItemService.create({
      token,
      email: normalizedEmail,
      organisationId,
      roleId,
      invitedByUserId,
      expiresAt,
    })

    const acceptLink = `${config.site.url}/auth/accept-invitation?token=${token}`

    if (deliveryMethod === 'link') {
      console.log(`[Organisation Invitation] Invitation link created for ${normalizedEmail} for org ${org.name}`)
      return { success: true, invitationLink: acceptLink }
    }

    // Send invitation email
    const result = await emailService.sendOrganisationInvitation(normalizedEmail, {
      organisationName: org.name,
      inviterName,
      acceptLink,
      expiresInDays: INVITATION_EXPIRY_DAYS,
    })

    if (!result.success) {
      // Rollback invitation if email fails
      const inv = await organisationInvitationsItemService.findOne({ token })
      if (inv)
        await organisationInvitationsItemService.delete(inv.id)
      throw createError({ statusCode: 500, statusMessage: 'Failed to send invitation email' })
    }

    console.log(`[Organisation Invitation] Invitation sent to ${normalizedEmail} for org ${org.name}`)

    return { success: true }
  }

  /**
   * Validate an invitation token (for showing acceptance form)
   */
  const validateInvitation = async (token: string): Promise<{
    valid: boolean
    email?: string
    organisationName?: string
  }> => {
    const invitation = await organisationInvitationsItemService.findOne({ token })

    if (!invitation || new Date(invitation.expiresAt) < new Date()) {
      return { valid: false }
    }

    const org = await organisationsItemService.readOne(invitation.organisationId)

    return {
      valid: true,
      email: invitation.email,
      organisationName: org?.name,
    }
  }

  /**
   * Accept an invitation and create the user account
   */
  const acceptInvitation = async (input: AcceptInvitationInput): Promise<AcceptInvitationResult> => {
    const { token, password, name } = input

    const invitation = await organisationInvitationsItemService.findOne({ token })

    if (!invitation) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid invitation token' })
    }

    if (new Date(invitation.expiresAt) < new Date()) {
      throw createError({ statusCode: 400, statusMessage: 'Invitation has expired' })
    }

    const org = await organisationsItemService.readOne(invitation.organisationId)
    if (!org) {
      throw createError({ statusCode: 400, statusMessage: 'Organisation no longer exists' })
    }

    // Check if user was created between invitation and acceptance
    const existingUser = await usersItemService.findOne({ email: invitation.email })
    if (existingUser) {
      await organisationInvitationsItemService.delete(invitation.id)
      throw createError({
        statusCode: 409,
        statusMessage: 'An account with this email already exists. Please sign in.',
      })
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST)

    // Create user with email already verified
    const user = await usersItemService.create({
      email: invitation.email,
      passwordHash,
      name: name ?? null,
      emailVerified: true,
    })

    // Add user to organisation with assigned role
    await organisationMembersService.addMember({
      organisationId: invitation.organisationId,
      userId: user.id,
      roleId: invitation.roleId,
    })

    // Delete the invitation (single-use)
    await organisationInvitationsItemService.delete(invitation.id)

    console.log(`[Organisation Invitation] User ${user.email} accepted invitation and joined ${org.name}`)

    return {
      user: { id: user.id, email: user.email, name: user.name },
      organisationId: org.id,
      organisationName: org.name,
    }
  }

  /**
   * Clean up expired invitations
   */
  const cleanupExpiredInvitations = async (): Promise<number> => {
    const expired = await organisationInvitationsItemService.findMany({
      filter: { expiresAt: { _lt: new Date() } },
    })

    for (const inv of expired) {
      await organisationInvitationsItemService.delete(inv.id)
    }

    return expired.length
  }

  /**
   * List all invitations for an organisation (including expired)
   */
  const listByOrganisation = async (organisationId: string) => {
    const invitations = await organisationInvitationsItemService.findMany({
      filter: { organisationId: { _eq: organisationId } },
      sort: ['-createdAt'],
    })

    // Fetch related data for enrichment
    const roleIds = [...new Set(invitations.map(inv => inv.roleId))]
    const inviterIds = [...new Set(invitations.map(inv => inv.invitedByUserId))]

    const [rolesData, usersData] = await Promise.all([
      roleIds.length > 0
        ? rolesItemService.findMany({ filter: { id: { _in: roleIds } } })
        : [],
      inviterIds.length > 0
        ? usersItemService.findMany({ filter: { id: { _in: inviterIds } } })
        : [],
    ])

    const rolesMap = new Map(rolesData.map(r => [r.id, r]))
    const usersMap = new Map(usersData.map(u => [u.id, u]))

    const now = new Date()
    const enriched = invitations.map(inv => ({
      id: inv.id,
      email: inv.email,
      role: rolesMap.get(inv.roleId)
        ? { id: inv.roleId, name: rolesMap.get(inv.roleId)!.name }
        : null,
      invitedBy: usersMap.get(inv.invitedByUserId)
        ? { id: inv.invitedByUserId, name: usersMap.get(inv.invitedByUserId)!.name }
        : null,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
      isExpired: new Date(inv.expiresAt) < now,
      acceptLink: `${config.site.url}/auth/accept-invitation?token=${inv.token}`,
    }))

    return { invitations: enriched, total: enriched.length }
  }

  /**
   * Revoke/cancel an invitation
   */
  const revokeInvitation = async (invitationId: string): Promise<{ success: boolean }> => {
    const invitation = await organisationInvitationsItemService.readOne(invitationId)
    if (!invitation) {
      throw createError({ statusCode: 404, statusMessage: 'Invitation not found' })
    }

    await organisationInvitationsItemService.delete(invitationId)
    console.log(`[Organisation Invitation] Invitation ${invitationId} revoked`)

    return { success: true }
  }

  /**
   * Resend an invitation email (only for non-expired invitations)
   */
  const resendInvitation = async (invitationId: string): Promise<{ success: boolean }> => {
    const invitation = await organisationInvitationsItemService.readOne(invitationId)
    if (!invitation) {
      throw createError({ statusCode: 404, statusMessage: 'Invitation not found' })
    }

    if (new Date(invitation.expiresAt) < new Date()) {
      throw createError({ statusCode: 400, statusMessage: 'Cannot resend expired invitation' })
    }

    const org = await organisationsItemService.readOne(invitation.organisationId)
    if (!org) {
      throw createError({ statusCode: 404, statusMessage: 'Organisation not found' })
    }

    const inviter = await usersItemService.readOne(invitation.invitedByUserId)
    const acceptLink = `${config.site.url}/auth/accept-invitation?token=${invitation.token}`

    const result = await emailService.sendOrganisationInvitation(invitation.email, {
      organisationName: org.name,
      inviterName: inviter?.name ?? undefined,
      acceptLink,
      expiresInDays: Math.ceil((new Date(invitation.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
    })

    if (!result.success) {
      throw createError({ statusCode: 500, statusMessage: 'Failed to send invitation email' })
    }

    console.log(`[Organisation Invitation] Invitation resent to ${invitation.email}`)

    return { success: true }
  }

  return {
    createInvitation,
    validateInvitation,
    acceptInvitation,
    cleanupExpiredInvitations,
    listByOrganisation,
    revokeInvitation,
    resendInvitation,
  }
}

export type OrganisationInvitationsService = ReturnType<typeof createOrganisationInvitationsService>
