export default defineNuxtRouteMiddleware(() => {
  // Use pre-fetched server auth state (safe in middleware - no inject() warning)
  const { isAuthenticated, isGlobalAdmin } = useServerAuth()

  // Must be authenticated first
  if (!isAuthenticated) {
    return navigateTo({
      path: ROUTES.auth.signIn,
      query: { redirect: ROUTES.admin.home },
    })
  }

  // Check admin permissions
  if (!isGlobalAdmin) {
    return navigateTo(ROUTES.errors.unauthorized)
  }
})
