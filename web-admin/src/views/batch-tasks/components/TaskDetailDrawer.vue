<template>
  <a-drawer v-model:open="open" title="任务详情" width="800" @close="handleClose">
    <div v-if="loading" class="loading-container">
      <a-spin size="large" />
    </div>

    <div v-else-if="taskDetail" class="task-detail">
      <!-- 任务基本信息 -->
      <a-card size="small" title="基本信息" class="detail-card">
        <a-descriptions :column="2" size="small">
          <a-descriptions-item label="任务ID">
            {{ taskDetail.id }}
          </a-descriptions-item>
          <a-descriptions-item label="任务类型">
            <a-tag :color="taskDetail.type === 'upgrade' ? 'blue' : 'orange'">
              {{ taskDetail.type === 'upgrade' ? '批量升级' : '批量回滚' }}
            </a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="状态">
            <a-tag :color="getStatusColor(taskDetail.status)">
              {{ getStatusText(taskDetail.status) }}
            </a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="创建者">
            {{ taskDetail.creator }}
          </a-descriptions-item>
          <a-descriptions-item label="项目类型">
            {{ taskDetail.config?.project === 'frontend' ? '前端' : '后端' }}
          </a-descriptions-item>
          <a-descriptions-item label="目标包/版本">
            {{ getTargetInfo(taskDetail) }}
          </a-descriptions-item>
          <a-descriptions-item label="创建时间">
            {{ formatDateTime(taskDetail.createdAt) }}
          </a-descriptions-item>
          <a-descriptions-item label="执行时长">
            {{ getTaskDuration(taskDetail) }}
          </a-descriptions-item>
        </a-descriptions>
      </a-card>

      <!-- 执行进度 -->
      <a-card size="small" title="执行进度" class="detail-card">
        <div class="progress-overview">
          <a-row :gutter="16">
            <a-col :span="6">
              <a-statistic title="总设备" :value="taskDetail.stats.total" :value-style="{ fontSize: '20px' }" />
            </a-col>
            <a-col :span="6">
              <a-statistic
                title="成功"
                :value="taskDetail.stats.success"
                :value-style="{ color: '#52c41a', fontSize: '20px' }"
              />
            </a-col>
            <a-col :span="6">
              <a-statistic
                title="失败"
                :value="taskDetail.stats.failed"
                :value-style="{ color: '#ff4d4f', fontSize: '20px' }"
              />
            </a-col>
            <a-col :span="6">
              <a-statistic
                title="超时"
                :value="taskDetail.stats.timeout"
                :value-style="{ color: '#faad14', fontSize: '20px' }"
              />
            </a-col>
          </a-row>

          <div class="overall-progress">
            <a-progress
              :percent="getOverallProgress(taskDetail)"
              :status="getProgressStatus(taskDetail.status)"
              stroke-color="#52c41a"
            />
          </div>
        </div>
      </a-card>

      <!-- 设备详情 -->
      <a-card :body-style="{ padding: '0 20px' }" size="small" class="detail-card">
        <template #extra> </template>

        <OperationBar @refresh="refreshTaskDetail">
          <template #title>
            <span>设备执行详情</span>
            <a-tag style="margin-left: 8px"> {{ taskDetail.devices?.length || 0 }} 台设备 </a-tag>
          </template>

          <template #actions>
            <a-form ref="queryFormRef" layout="inline" :model="queryParams">
              <a-form-item name="deviceFilter">
                <a-select
                  v-model:value="queryParams.deviceFilter"
                  placeholder="筛选设备状态"
                  style="width: 200px"
                  allow-clear
                  @change="handleDeviceFilterChange"
                >
                  <a-select-option value="waiting">等待中</a-select-option>
                  <a-select-option value="upgrading">执行中</a-select-option>
                  <a-select-option value="success">成功</a-select-option>
                  <a-select-option value="failed">失败</a-select-option>
                  <a-select-option value="timeout">超时</a-select-option>
                </a-select>
              </a-form-item>
            </a-form>
          </template>
        </OperationBar>

        <a-table
          :columns="deviceColumns"
          :data-source="filteredDevices"
          :pagination="devicePagination"
          size="small"
          row-key="deviceId"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'status'">
              <a-tag :color="getDeviceStatusColor(record.status)">
                {{ getDeviceStatusText(record.status) }}
              </a-tag>
            </template>

            <template v-if="column.key === 'duration'">
              {{ getDeviceDuration(record) }}
            </template>

            <template v-if="column.key === 'error'">
              <div v-if="record.error" class="error-cell">
                <a-tooltip :title="record.error">
                  <a-typography-text type="danger" ellipsis style="max-width: 200px">
                    {{ record.error }}
                  </a-typography-text>
                </a-tooltip>
              </div>
              <span v-else>-</span>
            </template>

            <template v-if="column.key === 'retryCount'">
              <a-badge
                v-if="record.retryCount > 0"
                :count="record.retryCount"
                :number-style="{ backgroundColor: '#faad14' }"
              />
              <span v-else>-</span>
            </template>
          </template>
        </a-table>
      </a-card>

      <!-- 执行日志 -->
      <a-card size="small" title="执行日志" class="detail-card">
        <div class="logs-container">
          <div v-for="(log, index) in taskDetail.logs" :key="index" class="log-entry" :class="`log-${log.level}`">
            <div class="log-header">
              <span class="log-time">{{ formatDateTime(log.timestamp) }}</span>
              <a-tag :color="getLogLevelColor(log.level)" size="small">
                {{ log.level.toUpperCase() }}
              </a-tag>
            </div>
            <div class="log-message">
              {{ log.message }}
            </div>
            <div v-if="log.details" class="log-details">
              <a-typography-text code>
                {{ JSON.stringify(log.details, null, 2) }}
              </a-typography-text>
            </div>
          </div>
        </div>
      </a-card>

      <!-- 操作按钮 -->
      <div class="drawer-actions">
        <a-space>
          <a-button v-if="taskDetail.status === 'running'" danger @click="handleCancelTask"> 取消任务 </a-button>
          <a-button
            v-if="taskDetail.status === 'completed' && taskDetail.stats.failed > 0"
            type="primary"
            @click="handleRetryFailedDevices"
          >
            重试失败设备
          </a-button>
          <a-button @click="handleClose"> 关闭 </a-button>
        </a-space>
      </div>
    </div>

    <div v-else class="empty-container">
      <a-empty description="未找到任务详情" />
    </div>
  </a-drawer>
</template>

<script setup>
import { batchApi } from '@/api'
import { message, Modal } from 'ant-design-vue'
import { computed, reactive, ref, watch } from 'vue'
import OperationBar from '@/components/OperationBar.vue'

// Props 和双向绑定
const open = defineModel('open', { type: Boolean, default: false })

const props = defineProps({
  taskId: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['refresh'])

// 表单引用
const queryFormRef = ref(null)

// 数据状态
const loading = ref(false)
const taskDetail = ref(null)

// 查询参数
const queryParams = reactive({
  deviceFilter: null
})

// 设备分页配置
const devicePagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
  showSizeChanger: true,
  showTotal: (total) => `共 ${total} 台设备`
})

// 设备表格列配置
const deviceColumns = [
  {
    title: '设备ID',
    dataIndex: 'deviceId',
    key: 'deviceId',
    width: 120
  },
  {
    title: '状态',
    key: 'status',
    width: 100
  },
  {
    title: '开始时间',
    dataIndex: 'startTime',
    key: 'startTime',
    width: 150,
    customRender: ({ text }) => formatDateTime(text)
  },
  {
    title: '结束时间',
    dataIndex: 'endTime',
    key: 'endTime',
    width: 150,
    customRender: ({ text }) => formatDateTime(text)
  },
  {
    title: '执行时长',
    key: 'duration',
    width: 100
  },
  {
    title: '重试次数',
    key: 'retryCount',
    width: 80
  },
  {
    title: '错误信息',
    key: 'error',
    width: 200
  }
]

// 计算属性
const filteredDevices = computed(() => {
  if (!taskDetail.value?.devices) return []

  let devices = taskDetail.value.devices

  if (queryParams.deviceFilter) {
    devices = devices.filter((device) => device.status === queryParams.deviceFilter)
  }

  return devices
})

// 监听筛选结果变化，更新分页总数
watch(
  filteredDevices,
  (newDevices) => {
    devicePagination.total = newDevices.length
  },
  { immediate: true }
)

// 监听器
watch(
  () => open.value,
  (newVal) => {
    if (newVal && props.taskId) {
      fetchTaskDetail()
    }
  }
)

watch(
  () => props.taskId,
  (newTaskId, oldTaskId) => {
    if (newTaskId && newTaskId !== oldTaskId && open.value) {
      fetchTaskDetail()
    }
  }
)

// 方法
async function fetchTaskDetail() {
  if (!props.taskId) return

  loading.value = true
  try {
    const response = await batchApi.getBatchTask(props.taskId)
    if (response.success) {
      taskDetail.value = response.task
      devicePagination.current = 1
    } else {
      message.error(response.error || '获取任务详情失败')
    }
  } catch (error) {
    console.error('获取任务详情失败:', error)
    message.error('获取任务详情失败')
  } finally {
    loading.value = false
  }
}

function refreshTaskDetail() {
  fetchTaskDetail()
}

function handleDeviceFilterChange() {
  devicePagination.current = 1
}

function handleClose() {
  open.value = false
  taskDetail.value = null
  queryParams.deviceFilter = null
}

async function handleCancelTask() {
  Modal.confirm({
    title: '确认取消任务',
    content: `确定要取消任务 ${props.taskId} 吗？此操作不可撤销。`,
    onOk: async () => {
      try {
        const response = await batchApi.cancelBatchTask(props.taskId)
        if (response.success) {
          message.success('任务已取消')
          emit('refresh')
          await fetchTaskDetail()
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

async function handleRetryFailedDevices() {
  Modal.confirm({
    title: '重试失败设备',
    content: `确定要重试任务 ${props.taskId} 中的失败设备吗？`,
    onOk: async () => {
      try {
        const response = await batchApi.retryFailedDevices(props.taskId)
        if (response.success) {
          message.success('失败设备重试已启动')
          emit('refresh')
          await fetchTaskDetail()
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

// 工具函数
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

function getDeviceStatusColor(status) {
  const colors = {
    waiting: 'default',
    upgrading: 'processing',
    success: 'success',
    failed: 'error',
    timeout: 'warning'
  }
  return colors[status] || 'default'
}

function getDeviceStatusText(status) {
  const texts = {
    waiting: '等待中',
    upgrading: '执行中',
    success: '成功',
    failed: '失败',
    timeout: '超时'
  }
  return texts[status] || status
}

function getLogLevelColor(level) {
  const colors = {
    info: 'blue',
    warning: 'orange',
    error: 'red',
    success: 'green'
  }
  return colors[level] || 'default'
}

function getTargetInfo(task) {
  if (task.type === 'upgrade') {
    return task.config?.packageInfo?.fileName || '-'
  } else {
    return task.config?.targetVersion || '上一版本'
  }
}

function getOverallProgress(task) {
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

function getDeviceDuration(device) {
  if (!device.startTime) return '-'

  const startTime = new Date(device.startTime)
  const endTime = device.endTime ? new Date(device.endTime) : new Date()
  const duration = endTime - startTime

  const minutes = Math.floor(duration / (1000 * 60))
  const seconds = Math.floor((duration % (1000 * 60)) / 1000)

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  } else {
    return `${seconds}s`
  }
}

function formatDateTime(dateString) {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleString('zh-CN')
}
</script>

<style scoped>
.loading-container,
.empty-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
}

.task-detail {
  height: 100%;
}

.detail-card {
  margin-bottom: 16px;
  border-radius: 6px;
}

.progress-overview {
  padding: 16px 0;
}

.overall-progress {
  margin-top: 24px;
}

.error-cell {
  max-width: 200px;
}

.logs-container {
  max-height: 400px;
  overflow-y: auto;
  background-color: #fafafa;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  padding: 12px;
}

.log-entry {
  margin-bottom: 12px;
  padding: 8px;
  border-radius: 4px;
  background-color: #fff;
  border-left: 3px solid #d9d9d9;
}

.log-entry.log-info {
  border-left-color: #1890ff;
}

.log-entry.log-warning {
  border-left-color: #faad14;
}

.log-entry.log-error {
  border-left-color: #ff4d4f;
}

.log-entry.log-success {
  border-left-color: #52c41a;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.log-time {
  font-size: 12px;
  color: #666;
}

.log-message {
  font-size: 14px;
  margin-bottom: 4px;
}

.log-details {
  font-size: 12px;
  margin-top: 8px;
}

.drawer-actions {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
  text-align: right;
}
</style>
