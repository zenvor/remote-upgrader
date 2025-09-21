<template>
  <a-row :gutter="16" style="margin-bottom: 24px">
    <a-col :xs="12" :sm="8" :md="8" :lg="8" :xl="8">
      <a-card :bordered="false">
        <div class="flex items-center">
          <CheckCircleIcon class="mr-2 text-green-600" style="font-size: 22px" />
          <div>
            <div class="text-gray-500">在线设备</div>
            <div class="text-xl font-semibold">{{ stats.online }}</div>
          </div>
        </div>
      </a-card>
    </a-col>
    <a-col :xs="12" :sm="8" :md="8" :lg="8" :xl="8">
      <a-card :bordered="false">
        <div class="flex items-center">
          <CloseCircleIcon class="mr-2 text-red-600" style="font-size: 22px" />
          <div>
            <div class="text-gray-500">离线设备</div>
            <div class="text-xl font-semibold">{{ stats.offline }}</div>
          </div>
        </div>
      </a-card>
    </a-col>
    <a-col :xs="12" :sm="8" :md="8" :lg="8" :xl="8">
      <a-card :bordered="false">
        <div class="flex items-center">
          <ServerIcon class="mr-2 text-gray-600" style="font-size: 22px" />
          <div>
            <div class="text-gray-500">总设备数</div>
            <div class="text-xl font-semibold">{{ stats.total }}</div>
          </div>
        </div>
      </a-card>
    </a-col>
  </a-row>
</template>

<script setup>
import {
  CheckCircleOutlined as CheckCircleIcon,
  CloseCircleOutlined as CloseCircleIcon,
  HddOutlined as ServerIcon
} from '@ant-design/icons-vue'

// Props
defineProps({
  stats: {
    type: Object,
    required: true,
    validator: (value) => {
      return (
        typeof value === 'object' &&
        typeof value.online === 'number' &&
        typeof value.offline === 'number' &&
        typeof value.total === 'number'
      )
    }
  }
})
</script>

<style scoped>
/* 组件无需额外样式，使用 Tailwind CSS 类 */
</style>
