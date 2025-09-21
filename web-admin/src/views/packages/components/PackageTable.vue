<template>
  <a-table
    :data-source="packages"
    :columns="pkgColumnsAntd"
    :loading="loading"
    row-key="id"
    :pagination="false"
    size="small"
  >
    <!-- 在表格内部渲染操作列 -->
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'actions'">
        <a-space>
          <a-button size="small" @click="showPackageDetails(record)">
            <EyeOutlined />
            详情
          </a-button>
          <a-button size="small" danger @click="deletePackage(record)">
            <DeleteOutlined />
            删除
          </a-button>
        </a-space>
      </template>
    </template>
  </a-table>
</template>

<script setup>
import { h } from 'vue'
import { CloudOutlined, DeleteOutlined, EyeOutlined, HddOutlined } from '@ant-design/icons-vue'
import { Modal } from 'ant-design-vue'

// Props
defineProps({
  packages: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  }
})

// Events
const emit = defineEmits(['show-details', 'delete-package'])

// 方法
const showPackageDetails = (pkg) => {
  emit('show-details', pkg)
}

const deletePackage = (pkg) => {
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除包 "${pkg.fileName}" 吗？此操作不可恢复。`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    onOk() {
      emit('delete-package', pkg)
    }
  })
}

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

// Ant Design 表格列配置
const pkgColumnsAntd = [
  {
    key: 'fileName',
    dataIndex: 'fileName',
    title: '包名称',
    customRender: ({ record }) =>
      h('div', { class: 'flex items-center space-x-3' }, [
        h(record.project === 'backend' ? HddOutlined : CloudOutlined, {
          class: record.project === 'backend' ? 'text-lg text-green-600' : 'text-lg text-blue-600'
        }),
        h('div', null, [
          h('div', { class: 'font-medium text-gray-900' }, record.fileName),
          h('div', { class: 'text-sm text-gray-500' }, record.version || '未知版本')
        ])
      ])
  },
  {
    key: 'project',
    dataIndex: 'project',
    title: '项目',
    customRender: ({ record }) => {
      const color = record.project === 'frontend' ? 'blue' : 'green'
      const label = getProjectLabel(record.project)
      return h('a-tag', { color }, label)
    }
  },
  {
    key: 'fileSize',
    dataIndex: 'fileSize',
    title: '文件大小',
    customRender: ({ record }) => formatFileSize(record.fileSize)
  },
  {
    key: 'uploadedAt',
    dataIndex: 'uploadedAt',
    title: '上传时间',
    customRender: ({ record }) => formatDate(record.uploadedAt)
  },
  {
    key: 'fileMD5',
    dataIndex: 'fileMD5',
    title: 'MD5校验',
    customRender: ({ record }) =>
      h(
        'div',
        { class: 'font-mono text-xs text-gray-600 max-w-40 truncate', title: record.fileMD5 || '-' },
        record.fileMD5 || '-'
      )
  },
  {
    key: 'actions',
    title: '操作',
    align: 'center',
    width: 160
  }
]
</script>