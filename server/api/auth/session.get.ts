export default defineEventHandler((event) => {
  return {
    user: event.context.user,
    impersonation: event.context.impersonation ?? null,
  }
})
