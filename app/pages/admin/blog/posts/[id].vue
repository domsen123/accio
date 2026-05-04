<script setup lang="ts">
import AdminBlogPostForm from '~/features/admin/components/AdminBlogPostForm.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const postId = computed(() => route.params.id as string)
const { post, status, error } = useAdminBlogPost(postId)

const isLoading = computed(() => status.value === 'pending')

useSeoMeta({
  title: () => post.value
    ? `Edit ${post.value.title} - Admin`
    : 'Edit Post - Admin',
})

const onSuccess = () => {
  toast.add({ title: 'Post updated', color: 'success' })
  router.push(ROUTES.admin.blogPosts)
}

const onCancel = () => {
  router.push(ROUTES.admin.blogPosts)
}
</script>

<template>
  <div class="p-6">
    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <UIcon name="i-lucide-loader-2" class="animate-spin size-8 text-muted" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      title="Failed to load post"
      :description="error.message"
      icon="i-lucide-alert-circle"
    />

    <AdminBlogPostForm
      v-else-if="post"
      :post="post"
      @success="onSuccess"
      @cancel="onCancel"
    />
  </div>
</template>
