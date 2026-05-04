import type { organisationMembers, organisations, roles, users } from '~~/server/database/schema'
import type { RbacService } from '~~/server/features/rbac/rbac.service'
import type { ItemService } from '~~/server/infrastructure/database/item-service'

export interface OrganisationMemberWithUser {
  id: string
  organisationId: string
  userId: string
  createdAt: Date
  updatedAt: Date
  user: {
    id: string
    email: string | null
    name: string | null
  }
  role: {
    id: string
    name: string
  } | null
}

export interface AddMemberInput {
  organisationId: string
  userId: string
  roleId: string
}

export interface UpdateMemberRoleInput {
  organisationId: string
  userId: string
  newRoleId: string
}

export interface InviteMemberInput {
  organisationId: string
  email: string
  roleId: string
}

export interface CreateOrganisationMembersServiceDeps {
  organisationMembersItemService: ItemService<typeof organisationMembers>
  usersItemService: ItemService<typeof users>
  organisationsItemService: ItemService<typeof organisations>
  rolesItemService: ItemService<typeof roles>
  rbacService: RbacService
}

export const createOrganisationMembersService = (deps: CreateOrganisationMembersServiceDeps) => {
  const {
    organisationMembersItemService,
    usersItemService,
    organisationsItemService,
    rolesItemService,
    rbacService,
  } = deps

  /**
   * List all members of an organisation with their user details and role
   */
  const listMembers = async (organisationId: string): Promise<OrganisationMemberWithUser[]> => {
    const members = await organisationMembersItemService.findMany({
      filter: { organisationId },
      sort: ['createdAt'],
    })

    if (members.length === 0) {
      return []
    }

    // Get user IDs
    const userIds = members.map(m => m.userId)

    // Fetch users
    const usersData = await usersItemService.findMany({
      filter: { id: { _in: userIds } },
    })
    const usersMap = new Map(usersData.map(u => [u.id, u]))

    // Get user roles for this organisation
    const userRoles = await Promise.all(
      members.map(m => rbacService.getUserRoles(m.userId, 'organisation', organisationId)),
    )

    return members.map((member, idx) => {
      const user = usersMap.get(member.userId)
      const memberRoles = userRoles[idx] ?? []
      // Get the first org-scoped role (there should typically be one)
      const primaryRole = memberRoles[0]

      return {
        id: member.id,
        organisationId: member.organisationId,
        userId: member.userId,
        createdAt: member.createdAt,
        updatedAt: member.updatedAt,
        user: {
          id: user?.id ?? member.userId,
          email: user?.email ?? null,
          name: user?.name ?? null,
        },
        role: primaryRole
          ? { id: primaryRole.id, name: primaryRole.name }
          : null,
      }
    })
  }

  /**
   * Get a single member by user ID
   */
  const getMemberByUserId = async (
    organisationId: string,
    userId: string,
  ): Promise<OrganisationMemberWithUser | null> => {
    const member = await organisationMembersItemService.findOne({
      organisationId,
      userId,
    })

    if (!member) {
      return null
    }

    const user = await usersItemService.readOne(userId)
    const userRoles = await rbacService.getUserRoles(userId, 'organisation', organisationId)
    const primaryRole = userRoles[0]

    return {
      id: member.id,
      organisationId: member.organisationId,
      userId: member.userId,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
      user: {
        id: user?.id ?? userId,
        email: user?.email ?? 'unknown',
        name: user?.name ?? null,
      },
      role: primaryRole
        ? { id: primaryRole.id, name: primaryRole.name }
        : null,
    }
  }

  /**
   * Add a user as a member of an organisation with a specific role
   */
  const addMember = async (input: AddMemberInput): Promise<OrganisationMemberWithUser> => {
    const { organisationId, userId, roleId } = input

    // Verify organisation exists
    const org = await organisationsItemService.readOne(organisationId)
    if (!org) {
      throw createError({ statusCode: 404, statusMessage: 'Organisation not found' })
    }

    // Verify user exists
    const user = await usersItemService.readOne(userId)
    if (!user) {
      throw createError({ statusCode: 404, statusMessage: 'User not found' })
    }

    // Verify role exists and is org-scoped
    const role = await rolesItemService.readOne(roleId)
    if (!role) {
      throw createError({ statusCode: 404, statusMessage: 'Role not found' })
    }
    if (role.scope !== 'organisation') {
      throw createError({ statusCode: 400, statusMessage: 'Role must be organisation-scoped' })
    }

    // Check if already a member
    const existing = await organisationMembersItemService.findOne({
      organisationId,
      userId,
    })
    if (existing) {
      throw createError({ statusCode: 409, statusMessage: 'User is already a member of this organisation' })
    }

    // Create membership record
    const member = await organisationMembersItemService.create({
      organisationId,
      userId,
    })

    // Assign RBAC role
    await rbacService.assignRole({
      userId,
      roleId,
      scope: 'organisation',
      scopeId: organisationId,
    })

    return {
      id: member.id,
      organisationId: member.organisationId,
      userId: member.userId,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      role: { id: role.id, name: role.name },
    }
  }

  /**
   * Update a member's role in the organisation
   */
  const updateMemberRole = async (input: UpdateMemberRoleInput): Promise<OrganisationMemberWithUser> => {
    const { organisationId, userId, newRoleId } = input

    // Get current membership
    const member = await organisationMembersItemService.findOne({
      organisationId,
      userId,
    })
    if (!member) {
      throw createError({ statusCode: 404, statusMessage: 'Member not found' })
    }

    // Verify new role exists and is org-scoped
    const newRole = await rolesItemService.readOne(newRoleId)
    if (!newRole) {
      throw createError({ statusCode: 404, statusMessage: 'Role not found' })
    }
    if (newRole.scope !== 'organisation') {
      throw createError({ statusCode: 400, statusMessage: 'Role must be organisation-scoped' })
    }

    // Check if this would demote the last owner
    const currentRoles = await rbacService.getUserRoles(userId, 'organisation', organisationId)
    const isCurrentlyOwner = currentRoles.some(r => r.name.toLowerCase() === 'owner')

    if (isCurrentlyOwner && newRole.name.toLowerCase() !== 'owner') {
      // Check if there are other owners
      const allMembers = await listMembers(organisationId)
      const owners = allMembers.filter(m => m.role?.name.toLowerCase() === 'owner')

      if (owners.length === 1) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Cannot demote the last owner. Assign another owner first.',
        })
      }
    }

    // Remove current roles
    for (const role of currentRoles) {
      await rbacService.removeRole(userId, role.id, 'organisation', organisationId)
    }

    // Assign new role
    await rbacService.assignRole({
      userId,
      roleId: newRoleId,
      scope: 'organisation',
      scopeId: organisationId,
    })

    const user = await usersItemService.readOne(userId)

    return {
      id: member.id,
      organisationId: member.organisationId,
      userId: member.userId,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
      user: {
        id: user?.id ?? userId,
        email: user?.email ?? 'unknown',
        name: user?.name ?? null,
      },
      role: { id: newRole.id, name: newRole.name },
    }
  }

  /**
   * Remove a member from an organisation
   */
  const removeMember = async (organisationId: string, userId: string): Promise<void> => {
    const member = await organisationMembersItemService.findOne({
      organisationId,
      userId,
    })
    if (!member) {
      throw createError({ statusCode: 404, statusMessage: 'Member not found' })
    }

    // Check if this is the last owner
    const allMembers = await listMembers(organisationId)
    const owners = allMembers.filter(m => m.role?.name.toLowerCase() === 'owner')
    const isOwner = owners.some(o => o.userId === userId)

    if (isOwner && owners.length === 1) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Cannot remove the last owner. Transfer ownership first.',
      })
    }

    // Remove RBAC roles for this org
    const currentRoles = await rbacService.getUserRoles(userId, 'organisation', organisationId)
    for (const role of currentRoles) {
      await rbacService.removeRole(userId, role.id, 'organisation', organisationId)
    }

    // Remove membership record
    await organisationMembersItemService.delete(member.id)
  }

  /**
   * Invite a user to an organisation by email
   * If the user exists, add them directly. Otherwise, return info for sending invite.
   */
  const inviteMember = async (input: InviteMemberInput): Promise<{
    member?: OrganisationMemberWithUser
    invited: boolean
    email: string
  }> => {
    const { organisationId, email, roleId } = input

    // Verify organisation exists
    const org = await organisationsItemService.readOne(organisationId)
    if (!org) {
      throw createError({ statusCode: 404, statusMessage: 'Organisation not found' })
    }

    // Verify role exists
    const role = await rolesItemService.readOne(roleId)
    if (!role || role.scope !== 'organisation') {
      throw createError({ statusCode: 400, statusMessage: 'Invalid role' })
    }

    // Check if user with this email exists
    const existingUser = await usersItemService.findOne({ email: email.toLowerCase().trim() })

    if (existingUser) {
      // Check if already a member
      const existingMember = await organisationMembersItemService.findOne({
        organisationId,
        userId: existingUser.id,
      })
      if (existingMember) {
        throw createError({ statusCode: 409, statusMessage: 'User is already a member of this organisation' })
      }

      // Add existing user directly
      const member = await addMember({
        organisationId,
        userId: existingUser.id,
        roleId,
      })

      return {
        member,
        invited: false,
        email,
      }
    }

    // User doesn't exist - for now, return that we need to send an invite
    // TODO: Implement invitation system (create pending invite, send email)
    return {
      invited: true,
      email,
    }
  }

  /**
   * Get available roles for an organisation (system + custom)
   */
  const getAvailableRoles = async (organisationId: string) => {
    return rbacService.getRolesByScope('organisation', organisationId)
  }

  return {
    listMembers,
    getMemberByUserId,
    addMember,
    updateMemberRole,
    removeMember,
    inviteMember,
    getAvailableRoles,
  }
}

export type OrganisationMembersService = ReturnType<typeof createOrganisationMembersService>
