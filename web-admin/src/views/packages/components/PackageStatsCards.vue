<template>
  <a-row :gutter="16" style="margin-bottom: 24px">
    <a-col :xs="12" :sm="8" :md="8" :lg="8" :xl="8">
      <a-card :bordered="false">
        <div class="flex items-center">
          <CloudOutlined class="mr-2 text-blue-600" />
          <div>
            <div class="text-gray-500">前端包</div>
            <div class="text-xl font-semibold">{{ stats.frontend }}</div>
          </div>
        </div>
      </a-card>
    </a-col>
    <a-col :xs="12" :sm="8" :md="8" :lg="8" :xl="8">
      <a-card :bordered="false">
        <div class="flex items-center">
          <HddOutlined class="mr-2 text-green-600" />
          <div>
            <div class="text-gray-500">后端包</div>
            <div class="text-xl font-semibold">{{ stats.backend }}</div>
          </div>
        </div>
      </a-card>
    </a-col>
    <a-col :xs="12" :sm="8" :md="8" :lg="8" :xl="8">
      <a-card :bordered="false">
        <div class="flex items-center">
          <CloudOutlined class="mr-2 text-orange-600" />
          <div>
            <div class="text-gray-500">总存储</div>
            <div class="text-xl font-semibold">{{ formatFileSize(stats.totalSize) }}</div>
          </div>
        </div>
      </a-card>
    </a-col>
  </a-row>
</template>

<script setup>
import { CloudOutlined, HddOutlined } from '@ant-design/icons-vue'

// Props
defineProps({
  stats: {
    type: Object,
    default: () => ({
      frontend: 0,
      backend: 0,
      totalSize: 0
    })
  }
})

/** 格式化文件大小 */
const formatFileSize = (bytes) => {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
</script>