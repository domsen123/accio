export default defineNuxtRouteMiddleware((to) => {
  // Skip middleware for auth pages
  if (to.path.startsWith('/auth/')) {
    return
  }

  // Check if route requires auth (defined in page meta)
  const requiresAuth = to.meta.auth === true

  if (!requiresAuth) {
    return
  }

  // Use pre-fetched server auth state (safe in middleware - no inject() warning)
  const { isAuthenticated } = useServerAuth()

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return navigateTo({
      path: ROUTES.auth.signIn,
      query: { redirect: to.fullPath },
    })
  }
})
