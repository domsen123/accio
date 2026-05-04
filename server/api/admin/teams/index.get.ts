import { requireSuperAdmin } from '~~/server/features/rbac/rbac.guard'
import { container } from '~~/server/utils/container'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const query = getQuery(event)
  const organisationId = query.organisationId as string | undefined
  const search = query.search as string | undefined
  const limit = query.limit ? Number(query.limit) : undefined
  const offset = query.offset ? Number(query.offset) : undefined
  const sort = query.sort as string | string[] | undefined

  // Build filter
  const filter: Record<string, unknown> = {}

  if (organisationId) {
    filter.organisationId = { _eq: organisationId }
  }

  if (search) {
    filter.name = { _ilike: `%${search}%` }
  }

  // Parse sort parameter
  const sortArray = sort
    ? (Array.isArray(sort) ? sort : [sort])
    : ['-createdAt']

  // Get total count (without pagination)
  const total = await container.items.teams.count(
    Object.keys(filter).length > 0 ? filter : undefined,
  )

  // Fetch paginated teams
  const teams = await container.items.teams.findMany({
    filter: Object.keys(filter).length > 0 ? filter : undefined,
    sort: sortArray,
    limit,
    offset,
  })

  // Get organisation data for all teams
  const orgIds = [...new Set(teams.map(t => t.organisationId))]
  const organisations = orgIds.length > 0
    ? await container.items.organisations.findMany({
        filter: { id: { _in: orgIds } },
      })
    : []
  const orgsMap = new Map(organisations.map(o => [o.id, o]))

  // Map teams with organisation data
  const teamsWithOrg = teams.map(team => ({
    ...team,
    organisation: {
      id: team.organisationId,
      name: orgsMap.get(team.organisationId)?.name ?? 'Unknown',
    },
  }))

  return {
    teams: teamsWithOrg,
    total,
  }
})
