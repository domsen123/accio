import {
  getPermissionsByCategory,
  getPermissionsByScope,
  PERMISSION_METADATA,
} from '~~/server/features/rbac/permissions'
import { requireAuth } from '~~/server/features/rbac/rbac.guard'

export default defineEventHandler(async (event) => {
  requireAuth(event)

  return {
    permissions: Object.values(PERMISSION_METADATA),
    byScope: {
      global: getPermissionsByScope('global'),
      organisation: getPermissionsByScope('organisation'),
      team: getPermissionsByScope('team'),
    },
    byCategory: getPermissionsByCategory(),
  }
})
