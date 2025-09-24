<template>
  <a-card class="query-card" style="margin-bottom: 16px" :body-style="{ padding: '20px 20px 0' }" :bordered="false">
    <a-form ref="queryFormRef" layout="inline" :model="queryParams" class="query-form">
      <a-form-item label="设备名称或ID" name="search">
        <a-input v-model:value="queryParams.search" allow-clear placeholder="搜索设备名称或ID" style="width: 200px" />
      </a-form-item>

      <a-form-item label="状态" name="status">
        <a-select
          v-model:value="queryParams.status"
          style="width: 200px"
          :options="statusOptions"
          placeholder="设备状态"
          allow-clear
          @change="handleStatusChange"
        />
      </a-form-item>

      <a-form-item>
        <a-space>
          <a-button type="primary" @click="handleQuery">
            <template #icon><SearchOutlined /></template>
            查询
          </a-button>
          <a-button @click="resetQuery">
            <template #icon><ReloadOutlined /></template>
            重置
          </a-button>
        </a-space>
      </a-form-item>
    </a-form>
  </a-card>
</template>

<script setup>
import { ref } from 'vue'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons-vue'

// Props
defineProps({
  modelValue: {
    type: Object,
    default: () => ({ status: null, search: null })
  }
})

// Emits
const emits = defineEmits(['update:modelValue', 'query', 'reset', 'statusChange'])

// 查询参数（使用 v-model）
const queryParams = defineModel('modelValue', {
  type: Object,
  default: () => ({ status: null, search: null })
})

// 表单引用
const queryFormRef = ref(null)

// 状态选项
const statusOptions = [
  { value: 'online', label: '在线' },
  { value: 'offline', label: '离线' },
  { value: 'upgrading', label: '升级中' },
  { value: 'error', label: '错误' }
]

// 查询处理
const handleQuery = () => {
  emits('query')
}

// 重置查询
const resetQuery = () => {
  queryFormRef.value?.resetFields()
  emits('reset')
}

// 状态改变处理
const handleStatusChange = (value) => {
  emits('statusChange', value)
}
</script>

<style scoped>
.query-form {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.query-form .ant-form-item {
  margin-bottom: 20px;
}
</style>
