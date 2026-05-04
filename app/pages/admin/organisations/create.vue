<script setup lang="ts">
import AdminOrganisationForm from '~/features/admin/components/AdminOrganisationForm.vue'

definePageMeta({
  layout: 'admin',
  middleware: ['admin'],
})

useSeoMeta({
  title: 'Create Organisation - Admin',
})

const router = useRouter()
const toast = useToast()

const onSuccess = () => {
  toast.add({ title: 'Organisation created', color: 'success' })
  router.push(ROUTES.admin.organisations)
}

const onCancel = () => {
  router.push(ROUTES.admin.organisations)
}
</script>

<template>
  <DashboardAdminPage
    title="Create Organisation"
    :breadcrumb="[
      { label: 'Organisations', to: ROUTES.admin.organisations },
      { label: 'Create' },
    ]"
  >
    <div class="flex flex-col gap-4 sm:gap-6 lg:gap-12 w-full lg:max-w-3xl mx-auto py-6 px-6 lg:py-12">
      <AdminOrganisationForm
        @success="onSuccess"
        @cancel="onCancel"
      />
    </div>
  </DashboardAdminPage>
</template>
