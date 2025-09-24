<template>
  <a-modal v-model:open="open" width="900px" :footer="null" @cancel="handleCancel">
    <template #title>
      <div class="modal-title">
        <span>批量任务监控</span>
        <a-button type="link" style="margin-right: 15px" @click="goToFullTaskManagement">
          <LinkOutlined />
          查看完整任务管理
        </a-button>
      </div>
    </template>
    <!-- 任务统计 -->
    <div class="task-stats">
      <a-row :gutter="16">
        <a-col :span="6">
          <a-card size="small">
            <a-statistic title="总任务" :value="taskStats.totalTasks" />
          </a-card>
        </a-col>
        <a-col :span="6">
          <a-card size="small">
            <a-statistic title="运行中" :value="taskStats.runningTasks" :value-style="{ color: '#1890ff' }" />
          </a-card>
        </a-col>
        <a-col :span="6">
          <a-card size="small">
            <a-statistic title="已完成" :value="taskStats.completedTasks" :value-style="{ color: '#52c41a' }" />
          </a-card>
        </a-col>
        <a-col :span="6">
          <a-card size="small">
            <a-statistic title="失败" :value="taskStats.failedTasks" :value-style="{ color: '#ff4d4f' }" />
          </a-card>
        </a-col>
      </a-row>
    </div>

    <!-- 任务列表 -->
    <div class="task-list">
      <div class="task-header">
        <h4>最近任务</h4>
        <a-space>
          <a-switch
            v-model:checked="autoRefresh"
            checked-children="自动刷新"
            un-checked-children="手动刷新"
            @change="handleAutoRefreshChange"
          />
          <a-button @click="refreshTasks">刷新</a-button>
        </a-space>
      </div>

      <a-table
        :columns="taskColumns"
        :data-source="tasks"
        :pagination="{ pageSize: 10, showSizeChanger: false }"
        :loading="loading"
        size="small"
        row-key="id"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'type'">
            <a-tag :color="record.type === 'upgrade' ? 'blue' : 'orange'">
              {{ record.type === 'upgrade' ? '升级' : '回滚' }}
            </a-tag>
          </template>

          <template v-if="column.key === 'status'">
            <a-tag :color="getStatusColor(record.status)">
              {{ getStatusText(record.status) }}
            </a-tag>
          </template>

          <template v-if="column.key === 'progress'">
            <div class="progress-cell">
              <a-progress
                :percent="getTaskProgress(record)"
                :status="getProgressStatus(record.status)"
                size="small"
                :show-info="false"
              />
              <span class="progress-text"> {{ record.stats.success }}/{{ record.stats.total }} </span>
            </div>
          </template>

          <template v-if="column.key === 'actions'">
            <a-space size="small">
              <a-button :disabled="record.status !== 'running'" size="small" danger @click="cancelTask(record)">
                取消
              </a-button>
              <a-button
                :disabled="record.status !== 'completed' || record.stats.failed === 0"
                size="small"
                type="primary"
                @click="retryFailedDevices(record)"
              >
                重试失败
              </a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </div>
  </a-modal>
</template>

<script setup>
import { batchApi } from '@/api'
import { message, Modal } from 'ant-design-vue'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { LinkOutlined } from '@ant-design/icons-vue'

const router = useRouter()

// Props 和双向绑定
const open = defineModel('open', { type: Boolean, default: false })

const tasks = ref([])
const taskStats = ref({
  totalTasks: 0,
  runningTasks: 0,
  completedTasks: 0,
  failedTasks: 0
})
const loading = ref(false)
const autoRefresh = ref(true)

// 自动刷新定时器
let refreshTimer = null

// 表格列配置
const taskColumns = [
  {
    title: '任务ID',
    dataIndex: 'id',
    key: 'id',
    width: 120,
    ellipsis: true
  },
  {
    title: '类型',
    key: 'type',
    width: 80
  },
  {
    title: '状态',
    key: 'status',
    width: 100
  },
  {
    title: '项目',
    dataIndex: ['config', 'project'],
    key: 'project',
    width: 80,
    customRender: ({ text }) => {
      if (text === 'frontend') return '前端'
      if (text === 'backend') return '后端'
      return '-'
    }
  },
  {
    title: '进度',
    key: 'progress',
    width: 160
  },
  {
    title: '创建时间',
    dataIndex: 'createdAt',
    key: 'createdAt',
    width: 150,
    customRender: ({ text }) => new Date(text).toLocaleString('zh-CN')
  },
  {
    title: '操作',
    align: 'center',
    key: 'actions',
    width: 150
  }
]

// 方法
function getStatusColor(status) {
  const colors = {
    pending: 'default',
    running: 'processing',
    completed: 'success',
    failed: 'error',
    cancelled: 'warning'
  }
  return colors[status] || 'default'
}

function getStatusText(status) {
  const texts = {
    pending: '待执行',
    running: '执行中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消'
  }
  return texts[status] || status
}

function getTaskProgress(task) {
  if (task.stats.total === 0) return 0
  return Math.round((task.stats.success / task.stats.total) * 100)
}

function getProgressStatus(status) {
  if (status === 'failed') return 'exception'
  if (status === 'completed') return 'success'
  if (status === 'running') return 'active'
  return 'normal'
}

async function fetchTasks() {
  loading.value = true
  try {
    const response = await batchApi.getBatchTasks({ pageSize: 20 })
    if (response.success) {
      tasks.value = response.tasks
    }
  } catch (error) {
    console.error('获取任务列表失败:', error)
    message.error('获取任务列表失败')
  } finally {
    loading.value = false
  }
}

async function fetchTaskStats() {
  try {
    const response = await batchApi.getBatchTaskStats()
    if (response.success) {
      taskStats.value = response.stats
    }
  } catch (error) {
    console.error('获取任务统计失败:', error)
  }
}

function refreshTasks() {
  fetchTasks()
  fetchTaskStats()
}

function handleAutoRefreshChange(checked) {
  if (checked) {
    startAutoRefresh()
  } else {
    stopAutoRefresh()
  }
}

function startAutoRefresh() {
  stopAutoRefresh()
  refreshTimer = setInterval(() => {
    refreshTasks()
  }, 5000) // 每5秒刷新
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

async function cancelTask(task) {
  Modal.confirm({
    title: '确认取消任务',
    content: `确定要取消任务 ${task.id} 吗？`,
    onOk: async () => {
      try {
        const response = await batchApi.cancelBatchTask(task.id)
        if (response.success) {
          message.success('任务已取消')
          refreshTasks()
        } else {
          message.error(response.error || '取消任务失败')
        }
      } catch (error) {
        console.error('取消任务失败:', error)
        message.error('取消任务失败')
      }
    }
  })
}

async function retryFailedDevices(task) {
  Modal.confirm({
    title: '重试失败设备',
    content: `确定要重试任务 ${task.id} 中的失败设备吗？`,
    onOk: async () => {
      try {
        const response = await batchApi.retryFailedDevices(task.id)
        if (response.success) {
          message.success('失败设备重试已启动')
          refreshTasks()
        } else {
          message.error(response.error || '重试失败')
        }
      } catch (error) {
        console.error('重试失败设备失败:', error)
        message.error('重试失败')
      }
    }
  })
}

function handleCancel() {
  open.value = false
  stopAutoRefresh()
}

// 跳转到完整任务管理页面
function goToFullTaskManagement() {
  router.push('/batch-tasks')
  handleCancel() // 关闭当前模态框
}

watch(open, (newOpen) => {
  if (newOpen) {
    refreshTasks()
    if (autoRefresh.value) {
      startAutoRefresh()
    }
  } else {
    stopAutoRefresh()
  }
})

// 生命周期
onMounted(() => {
  if (open.value) {
    refreshTasks()
    if (autoRefresh.value) {
      startAutoRefresh()
    }
  }
})

onBeforeUnmount(() => {
  stopAutoRefresh()
})
</script>

<style scoped>
.modal-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.task-stats {
  margin-bottom: 16px;
}

.task-list {
  margin-top: 20px;
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.task-header h4 {
  margin: 0;
}

.progress-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-text {
  font-size: 12px;
  color: #666;
  min-width: 50px;
}
</style>
