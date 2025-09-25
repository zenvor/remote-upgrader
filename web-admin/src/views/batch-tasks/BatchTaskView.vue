<template>
  <div class="page-container">
    <!-- 页面标题和操作栏 -->
    <a-card :bordered="false" size="small" class="info-card" :body-style="{ padding: '16px 20px' }">
      <div class="page-header">
        <div class="page-title">
          <h2>批量任务监控</h2>
          <p>实时监控批量升级和回滚任务的执行状态</p>
        </div>
        <div class="page-actions">
          <a-space>
            <a-button @click="refreshTasks">
              <ReloadOutlined />
              刷新
            </a-button>
            <a-button type="primary" @click="goToBatchOperation">
              <PlusOutlined />
              新建批量任务
            </a-button>
          </a-space>
        </div>
      </div>
    </a-card>

    <!-- 任务统计卡片 -->
    <div class="stats-cards">
      <a-row :gutter="16">
        <a-col :span="6">
          <a-card size="small" class="stat-card">
            <a-statistic title="总任务数" :value="taskStats.totalTasks" />
          </a-card>
        </a-col>
        <a-col :span="6">
          <a-card size="small" class="stat-card">
            <a-statistic title="运行中" :value="taskStats.runningTasks" :value-style="{ color: '#1890ff' }" />
          </a-card>
        </a-col>
        <a-col :span="6">
          <a-card size="small" class="stat-card">
            <a-statistic title="已完成" :value="taskStats.completedTasks" :value-style="{ color: '#52c41a' }" />
          </a-card>
        </a-col>
        <a-col :span="6">
          <a-card size="small" class="stat-card">
            <a-statistic title="失败任务" :value="taskStats.failedTasks" :value-style="{ color: '#ff4d4f' }" />
          </a-card>
        </a-col>
      </a-row>
    </div>

    <!-- 任务列表 -->
    <a-card :bordered="false" :body-style="{ padding: '0 20px' }" size="small" class="info-card">
      <OperationBar :total="pagination.total" :show-total="true" @refresh="fetchTasks">
        <template #title>
          <a-space align="center">
            <span>任务列表</span>
            <a-tag v-if="autoRefresh" color="green" style="margin-left: 8px"> 自动刷新 </a-tag>
          </a-space>
        </template>

        <template #actions>
          <a-space>
            <!-- 筛选器 -->
            <a-select
              v-model:value="filters.status"
              placeholder="任务状态"
              style="width: 200px"
              allow-clear
              @change="handleQuery"
            >
              <a-select-option value="pending">待执行</a-select-option>
              <a-select-option value="running">执行中</a-select-option>
              <a-select-option value="completed">已完成</a-select-option>
              <a-select-option value="failed">失败</a-select-option>
              <a-select-option value="cancelled">已取消</a-select-option>
            </a-select>

            <a-select
              v-model:value="filters.type"
              placeholder="任务类型"
              style="width: 200px"
              allow-clear
              @change="handleQuery"
            >
              <a-select-option value="upgrade">升级</a-select-option>
              <a-select-option value="rollback">回滚</a-select-option>
            </a-select>

            <!-- 自动刷新开关 -->
            <a-switch
              v-model:checked="autoRefresh"
              checked-children="自动刷新"
              un-checked-children="手动刷新"
              @change="handleAutoRefreshChange"
            />
          </a-space>
        </template>
      </OperationBar>

      <!-- 任务表格 -->
      <a-table
        :columns="taskColumns"
        :data-source="tasks"
        :pagination="pagination"
        :loading="tasksLoading"
        size="small"
        row-key="id"
        @change="handleTableChange"
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

          <template v-if="column.key === 'duration'">
            {{ getTaskDuration(record) }}
          </template>

          <template v-if="column.key === 'actions'">
            <a-space size="small">
              <a-button size="small" @click="viewTaskDetail(record)"> 详情 </a-button>
              <a-button v-if="record.status === 'running'" size="small" danger @click="cancelTask(record)">
                取消
              </a-button>
              <a-button
                v-if="record.status === 'completed' && record.stats.failed > 0"
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
    </a-card>

    <!-- 任务详情抽屉 -->
    <TaskDetailDrawer v-model:open="taskDetailVisible" :task-id="selectedTaskId" @refresh="refreshTasks" />
  </div>
</template>

<script setup>
import { batchApi } from '@/api'
import OperationBar from '@/components/OperationBar.vue'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import { message, Modal } from 'ant-design-vue'
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TaskDetailDrawer from './components/TaskDetailDrawer.vue'

const router = useRouter()
const route = useRoute()

// 响应式数据
const tasks = ref([])
const taskStats = ref({
  totalTasks: 0,
  runningTasks: 0,
  completedTasks: 0,
  failedTasks: 0
})
const tasksLoading = ref(false)
const statsLoading = ref(false)
const autoRefresh = ref(true)
const taskDetailVisible = ref(false)
const selectedTaskId = ref('')
const hasOpenedFromQuery = ref(false)

// 筛选器
const filters = reactive({
  status: null,
  type: null
})

// 分页配置
const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  showTotal: (total) => `共 ${total} 个任务`
})

// 自动刷新定时器
let refreshTimer = null

// 表格列配置
const taskColumns = [
  {
    title: '任务ID',
    dataIndex: 'id',
    key: 'id',
    ellipsis: true
  },
  {
    title: '类型',
    key: 'type'
  },
  {
    title: '状态',
    key: 'status'
  },
  {
    title: '项目',
    dataIndex: ['config', 'project'],
    key: 'project',
    customRender: ({ text }) => {
      if (text === 'frontend') return '前端'
      if (text === 'backend') return '后端'
      return '-'
    }
  },
  {
    title: '目标包/版本',
    key: 'target',
    customRender: ({ record }) => {
      if (record.type === 'upgrade') {
        return record.config?.packageInfo?.fileName || '-'
      } else {
        return record.config?.targetVersion || '上一版本'
      }
    }
  },
  {
    title: '进度',
    key: 'progress',
    width: 160
  },
  {
    title: '执行时长',
    key: 'duration'
  },
  {
    title: '创建者',
    dataIndex: 'creator',
    key: 'creator'
  },
  {
    title: '创建时间',
    dataIndex: 'createdAt',
    key: 'createdAt',
    customRender: ({ text }) => formatDateTime(text)
  },
  {
    title: '操作',
    key: 'actions',
    align: 'center',
    width: 80,
    fixed: 'right'
  }
]

// 计算属性和方法
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

function getTaskDuration(task) {
  if (!task.startTime) return '-'

  const startTime = new Date(task.startTime)
  const endTime = task.endTime ? new Date(task.endTime) : new Date()
  const duration = endTime - startTime

  const hours = Math.floor(duration / (1000 * 60 * 60))
  const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((duration % (1000 * 60)) / 1000)

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  } else {
    return `${seconds}s`
  }
}

function formatDateTime(dateString) {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleString('zh-CN')
}

// 事件处理
async function fetchTasks() {
  tasksLoading.value = true
  try {
    const params = {
      pageNum: pagination.current,
      pageSize: pagination.pageSize,
      ...filters
    }

    // 移除空值
    Object.keys(params).forEach((key) => {
      if (params[key] === '' || params[key] === null || params[key] === undefined) {
        delete params[key]
      }
    })

    const response = await batchApi.getBatchTasks(params)
    if (response.success) {
      tasks.value = response.tasks
      pagination.total = response.total

      if (!hasOpenedFromQuery.value) {
        const queryTaskId = route.query.taskId
        const targetTaskId = Array.isArray(queryTaskId) ? queryTaskId[0] : queryTaskId
        if (targetTaskId) {
          const targetTask = tasks.value.find((task) => task.id === targetTaskId)
          if (targetTask) {
            viewTaskDetail(targetTask)
            hasOpenedFromQuery.value = true
          }
        }
      }
    }
  } catch (error) {
    console.error('获取任务列表失败:', error)
    message.error('获取任务列表失败')
  } finally {
    tasksLoading.value = false
  }
}

async function fetchTaskStats() {
  statsLoading.value = true
  try {
    const response = await batchApi.getBatchTaskStats()
    if (response.success) {
      taskStats.value = response.stats
    }
  } catch (error) {
    console.error('获取任务统计失败:', error)
  } finally {
    statsLoading.value = false
  }
}

function refreshTasks() {
  fetchTasks()
  fetchTaskStats()
}

function handleQuery() {
  pagination.current = 1
  fetchTasks()
}

function handleTableChange(newPagination) {
  pagination.current = newPagination.current
  pagination.pageSize = newPagination.pageSize
  fetchTasks()
}

function handleAutoRefreshChange(checked) {
  if (checked) {
    startAutoRefresh()
  } else {
    stopAutoRefresh()
  }
}

function startAutoRefresh() {
  stopAutoRefresh() // 清除现有定时器
  refreshTimer = setInterval(() => {
    fetchTasks()
    fetchTaskStats()
  }, 5000) // 每5秒刷新
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

function viewTaskDetail(task) {
  selectedTaskId.value = task.id
  taskDetailVisible.value = true
}

async function cancelTask(task) {
  Modal.confirm({
    title: '确认取消任务',
    content: `确定要取消任务 ${task.id} 吗？此操作不可撤销。`,
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

function goToBatchOperation() {
  router.push('/batch-tasks/create')
}

// 生命周期
onMounted(() => {
  refreshTasks()
  if (autoRefresh.value) {
    startAutoRefresh()
  }
})

onBeforeUnmount(() => {
  stopAutoRefresh()
})

watch(
  () => route.query.taskId,
  () => {
    hasOpenedFromQuery.value = false
  }
)

watch(taskDetailVisible, (visible) => {
  if (!visible && route.query.taskId) {
    const newQuery = { ...route.query }
    delete newQuery.taskId
    router.replace({ query: newQuery })
    hasOpenedFromQuery.value = false
  }
})
</script>

<style scoped>
.page-container {
  padding: 16px;
}

.info-card {
  margin-bottom: 16px;
  border-radius: 8px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.page-title h2 {
  margin: 0 0 4px 0;
  font-size: 20px;
  font-weight: 600;
}

.page-title p {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.stats-cards {
  margin-bottom: 16px;
}

.stat-card {
  border-radius: 8px;
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

.ant-table {
  border-radius: 8px;
}
</style>
