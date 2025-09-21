<template>
  <!-- 包详情对话框（Ant Design Modal） -->
  <a-modal
    v-model:open="open"
    :title="`包详情 - ${selectedPackage?.fileName}`"
    :width="960"
    :mask-closable="false"
  >
    <a-space v-if="selectedPackage" direction="vertical" size="large" style="width: 100%">
      <!-- 基本信息和完整性信息 -->
      <a-row :gutter="16">
        <a-col :span="12">
          <a-card title="基本信息">
            <a-space direction="vertical" size="small" style="width: 100%">
              <a-space align="center" style="width: 100%; justify-content: space-between">
                <span class="text-gray-500">文件名</span>
                <span>{{ selectedPackage.fileName }}</span>
              </a-space>
              <a-space align="center" style="width: 100%; justify-content: space-between">
                <span class="text-gray-500">项目类型</span>
                <a-tag style="margin: 0" :color="selectedPackage.project === 'frontend' ? 'blue' : 'green'">
                  {{ getProjectLabel(selectedPackage.project) }}
                </a-tag>
              </a-space>
              <a-space align="center" style="width: 100%; justify-content: space-between">
                <span class="text-gray-500">文件大小</span>
                <span>{{ formatFileSize(selectedPackage.fileSize) }}</span>
              </a-space>
              <a-space align="center" style="width: 100%; justify-content: space-between">
                <span class="text-gray-500">版本</span>
                <span>{{ selectedPackage.version || '未知版本' }}</span>
              </a-space>
              <a-space align="center" style="width: 100%; justify-content: space-between">
                <span class="text-gray-500">上传时间</span>
                <span>{{ formatDate(selectedPackage.uploadedAt) }}</span>
              </a-space>
              <a-space align="center" style="width: 100%; justify-content: space-between">
                <span class="text-gray-500">上传者</span>
                <span>{{ selectedPackage.uploader || '未知' }}</span>
              </a-space>
            </a-space>
          </a-card>
        </a-col>

        <a-col :span="12">
          <a-card title="完整性信息">
            <a-space direction="vertical" size="small" style="width: 100%">
              <a-space align="start" style="width: 100%; justify-content: space-between">
                <span class="text-gray-500">MD5 校验</span>
                <a-tag :color="selectedPackage.fileMD5 === '计算失败' ? 'red' : 'green'">
                  {{ selectedPackage.fileMD5 || '无' }}
                </a-tag>
              </a-space>
            </a-space>
          </a-card>
        </a-col>
      </a-row>
    </a-space>

    <template #footer>
      <a-space>
        <a-button @click="open = false">关闭</a-button>
      </a-space>
    </template>
  </a-modal>
</template>

<script setup>
// 使用 defineModel 实现 v-model:open 双向绑定
const open = defineModel('open', { type: Boolean, default: false })

// Props
defineProps({
  selectedPackage: {
    type: Object,
    default: null
  }
})

// 工具方法
const getProjectLabel = (project) => {
  return project === 'frontend' ? '前端项目' : '后端项目'
}

const formatFileSize = (bytes) => {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatDate = (timestamp) => {
  if (!timestamp) return '未知'
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '未知'
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}
</script>

<style scoped>
.text-gray-500 {
  color: #8c8c8c;
}
</style>