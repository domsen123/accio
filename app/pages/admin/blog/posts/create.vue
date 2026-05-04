<script setup lang="ts">
import AdminBlogPostForm from '~/features/admin/components/AdminBlogPostForm.vue'

useSeoMeta({
  title: 'Create Post - Admin',
})

const router = useRouter()
const toast = useToast()

const onSuccess = () => {
  toast.add({ title: 'Post created', color: 'success' })
  router.push(ROUTES.admin.blogPosts)
}

const onCancel = () => {
  router.push(ROUTES.admin.blogPosts)
}
</script>

<template>
  <div class="p-6">
    <AdminBlogPostForm
      @success="onSuccess"
      @cancel="onCancel"
    />
  </div>
</template>
