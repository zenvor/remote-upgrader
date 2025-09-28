<template>
  <div class="page-container">
    <!-- 统计卡片组件 -->
    <DeviceStatsCards :stats="deviceStatsForComponent" />

    <!-- 查询表单组件 -->
    <DeviceQueryForm v-model="queryParams" @query="handleQuery" @reset="resetQuery" @status-change="fetchData" />

    <a-card :bordered="false" :body-style="{ padding: '0 20px' }">
      <OperationBar
        :title="'设备管理'"
        :selected-count="selectedDevices.length"
        :total="pagination.total"
        :show-total="true"
        @refresh="fetchData"
      >
        <template #actions>
          <a-button type="primary" :disabled="!hasSelected" @click="showBatchUpgradeDialog">
            <UploadIcon />
            <span style="margin-left: 4px">批量升级</span>
          </a-button>
          <a-button danger ghost :disabled="!hasSelected" @click="showBatchRollbackDialog">
            <RefreshIcon />
            <span style="margin-left: 4px">批量回滚</span>
          </a-button>
          <a-button @click="goToTaskManagement">
            <DashboardOutlined />
            <span style="margin-left: 4px">任务管理中心</span>
          </a-button>
        </template>
      </OperationBar>

      <!-- 设备列表 -->
      <a-table
        :data-source="devices"
        :columns="devicesColumns"
        :loading="loading"
        row-key="deviceId"
        :row-selection="rowSelection"
        :pagination="pagination"
        :scroll="{ x: 1700 }"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record, text }">
          <!-- 设备名称列 -->
          <template v-if="column.key === 'deviceName'">
            <div class="flex items-center space-x-2">
              <span
                class="inline-block w-2 h-2 rounded-full"
                :class="record.status === 'online' ? 'bg-green-500' : 'bg-gray-400'"
              />
              <div>
                <div class="font-medium">{{ record.deviceName }}</div>
              </div>
            </div>
          </template>

          <!-- 设备ID列 -->
          <template v-else-if="column.key === 'deviceId'">
            <span class="text-xs text-gray-700 font-mono">{{ record.deviceId }}</span>
          </template>

          <!-- 状态列 -->
          <template v-else-if="column.key === 'status'">
            <a-tag :color="statusColor(record.status)">{{ getStatusLabel(record.status) }}</a-tag>
          </template>

          <!-- 版本列 -->
          <template v-else-if="column.key === 'version'">
            <span class="text-sm text-gray-700 font-mono">{{ record.version || '未知' }}</span>
          </template>

          <!-- 平台列 -->
          <template v-else-if="column.key === 'platform'">
            <div class="text-xs text-gray-700">
              <div>{{ record.platform || '未知' }}</div>
              <div v-if="record.osVersion || record.arch" class="text-gray-400">
                {{ [record.osVersion, record.arch].filter(Boolean).join(' / ') }}
              </div>
            </div>
          </template>

          <!-- 网络信息列 -->
          <template v-else-if="column.key === 'network'">
            <span class="text-sm text-gray-600">{{ record.wifiName || '-' }}</span>
          </template>

          <!-- IP 信息列 -->
          <template v-else-if="column.key === 'ip'">
            <div class="text-xs text-gray-700">
              <div>
                内网IP: <span class="font-mono">{{ record.localIp || '未知' }}</span>
              </div>
            </div>
          </template>

          <!-- 最后心跳列 -->
          <template v-else-if="column.key === 'lastHeartbeat'">
            <span class="text-sm text-gray-600">{{ formatLastActiveTime(record) }}</span>
          </template>

          <!-- 进度展示列 -->
          <template v-else-if="column.key === 'upgradeProgress'">
            <div v-if="getDeviceProgress(record.deviceId)" class="progress-container">
              <a-progress
                :percent="getDeviceProgress(record.deviceId).percent"
                :status="getDeviceProgress(record.deviceId).status"
                size="small"
                :show-info="false"
              />
              <div class="progress-text">{{ getDeviceProgress(record.deviceId).message }}</div>
            </div>
            <span v-else class="text-gray-400">-</span>
          </template>

          <!-- 操作列 -->
          <template v-else-if="column.key === 'actions'">
            <a-space>
              <a-button size="small" @click="showDeviceDetails(record)">
                <EyeOutlined />
                详情
              </a-button>
              <a-button size="small" type="primary" @click="showDeviceUpgradeDialog(record)">
                <RocketOutlined />
                升级
              </a-button>
              <a-button
                size="small"
                danger
                ghost
                :disabled="!record.deployInfo?.rollbackAvailable"
                @click="showDeviceRollbackDialog(record)"
              >
                <RefreshIcon />
                回滚到上一版本
              </a-button>
            </a-space>
          </template>

          <!-- 其他列走默认渲染 -->
          <template v-else>
            {{ text }}
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 升级对话框 -->
    <DeviceUpgradeDialog
      v-model:open="upgradeDialogVisible"
      :devices="upgradeTargetDevices"
      @success="handleDialogSuccess"
    />

    <!-- 回滚对话框 -->
    <DeviceRollbackDialog
      v-model:open="rollbackDialogVisible"
      :devices="rollbackTargetDevices"
      @success="handleDialogSuccess"
    />

    <!-- 设备详情对话框 -->
    <DeviceDetailModal v-model:open="deviceDetailVisible" :device="selectedDevice" :device-logs="deviceLogs" />
  </div>
</template>

<script setup>
import { deviceApi } from '@/api'
import OperationBar from '@/components/OperationBar.vue'
import socketService from '@/services/socket.js'
import toast from '@/utils/toast'
import {
  DashboardOutlined,
  EyeOutlined,
  ReloadOutlined as RefreshIcon,
  RocketOutlined,
  UploadOutlined as UploadIcon
} from '@ant-design/icons-vue'
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import DeviceDetailModal from './components/DeviceDetailModal.vue'
import DeviceQueryForm from './components/DeviceQueryForm.vue'
import DeviceRollbackDialog from './components/DeviceRollbackDialog.vue'
import DeviceStatsCards from './components/DeviceStatsCards.vue'
import DeviceUpgradeDialog from './components/DeviceUpgradeDialog.vue'

const router = useRouter()

// 数据状态
const devices = ref([])
const onlineCount = ref(0)
const selectedDevices = ref([])
const loading = ref(false)
const deviceLogs = ref([])

// 设备进度状态管理，使用 reactive 保证 Map 写入后触发视图更新
const deviceProgressMap = reactive(new Map())
// 会话到设备的映射表，解决后端暂未返回真实设备ID的问题
const sessionDeviceMap = reactive(new Map())

// 分页状态
const deviceDetailVisible = ref(false)
const selectedDevice = ref(null)

// 查询参数
const queryParams = ref({
  status: null,
  search: null
})

// 分页配置
const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条/共 ${total} 条`
})

// 升级对话框状态
const upgradeDialogVisible = ref(false)
const upgradeTargetDevices = ref([])

// 回滚对话框状态
const rollbackDialogVisible = ref(false)
const rollbackTargetDevices = ref([])

// 设备统计
const deviceStats = computed(() => {
  const online = onlineCount.value || devices.value.filter((d) => d.status === 'online').length
  const offline = Math.max((pagination.total || 0) - online, 0)

  return { online, offline }
})

// 为 DeviceStatsCards 组件准备的统计数据
const deviceStatsForComponent = computed(() => ({
  online: deviceStats.value.online,
  offline: deviceStats.value.offline,
  total: pagination.total || 0
}))

// 是否有选中项（基于选中 keys）
const hasSelected = computed(() => selectedDeviceKeys.value.length > 0)

// 获取设备列表（支持筛选参数）
const fetchData = async () => {
  loading.value = true
  try {
    const response = await deviceApi.getDeviceList({
      ...queryParams.value,
      pageNum: pagination.current,
      pageSize: pagination.pageSize
    })
    pagination.total = response.total
    devices.value = response.devices
    onlineCount.value = response.onlineCount
    return response
  } catch (error) {
    console.error('获取设备列表失败:', error)
  } finally {
    loading.value = false
  }
}

// 查询
const handleQuery = () => {
  pagination.current = 1
  fetchData()
}

// 重置查询参数
const resetQuery = () => {
  queryParams.value = { status: null, search: null }
  handleQuery()
}

// 检测离线设备（基于心跳超时）
const checkOfflineDevices = () => {
  const now = Date.now()
  const offlineThreshold = 30000 // 30秒无心跳则认为离线

  devices.value.forEach((device, index) => {
    if (device.status === 'online' && device.lastSeen) {
      if (now - device.lastSeen > offlineThreshold) {
        const disconnectedAt = new Date().toISOString()
        devices.value[index] = {
          ...device,
          status: 'offline',
          disconnectedAt, // 记录离线时间
          lastHeartbeat: device.lastHeartbeat || disconnectedAt // 保留最后心跳时间，如果没有则使用离线时间
        }
        console.log(`设备 ${device.deviceName} 被标记为离线`)
        toast.warn(`设备 "${device.deviceName}" 已离线`, '设备状态')
      }
    }
  })
}

// 离线检测定时器
let offlineCheckTimer = null

// 启动离线检测定时器
const startOfflineDetection = () => {
  if (offlineCheckTimer) {
    clearInterval(offlineCheckTimer)
  }
  // 每15秒检查一次离线设备
  offlineCheckTimer = setInterval(checkOfflineDevices, 15000)
  console.log('离线检测定时器已启动')
}

// 停止离线检测定时器
const stopOfflineDetection = () => {
  if (offlineCheckTimer) {
    clearInterval(offlineCheckTimer)
    offlineCheckTimer = null
    console.log('离线检测定时器已停止')
  }
}

fetchData()

// 记录会话与设备的绑定关系，便于后续通过会话ID反查设备
const registerDeviceSessions = (sessions = []) => {
  sessions.forEach((item) => {
    if (!item?.sessionId || !item?.deviceId) return
    sessionDeviceMap.set(item.sessionId, {
      deviceId: item.deviceId,
      deviceName: item.deviceName || ''
    })

    if (!deviceProgressMap.has(item.deviceId)) {
      updateDeviceProgress(item.deviceId, {
        percent: 0,
        status: 'active',
        message: '等待进度反馈'
      })
    }
  })
}

// 根据进度事件解析实际的设备ID，兼容后端返回 unknown 的场景
const resolveProgressDeviceId = (payload) => {
  if (!payload) return null
  if (payload.deviceId && payload.deviceId !== 'unknown') {
    return payload.deviceId
  }

  if (payload.sessionId && sessionDeviceMap.has(payload.sessionId)) {
    const sessionInfo = sessionDeviceMap.get(payload.sessionId)
    return sessionInfo?.deviceId || null
  }

  return null
}

const initializeDeviceProgress = (devicesList = [], operationType = 'upgrade') => {
  const messageMap = {
    upgrade: '准备开始升级',
    rollback: '准备开始回滚'
  }

  devicesList.forEach((device) => {
    if (!device?.deviceId) return

    // 检查设备是否已有进度状态，避免覆盖现有进度
    const existingProgress = deviceProgressMap.get(device.deviceId)
    if (existingProgress && existingProgress.percent > 0) {
      console.log(`设备 ${device.deviceId} 已有进度状态，跳过初始化`)
      return
    }

    const displayMessage = messageMap[operationType] || '准备执行操作'

    updateDeviceProgress(device.deviceId, {
      percent: 0,
      status: 'active',
      message: displayMessage
    })
  })
}

const handleDialogSuccess = (payload = null) => {
  if (payload?.devices?.length) {
    initializeDeviceProgress(payload.devices, payload?.operationType || 'upgrade')
  }

  if (payload?.sessions?.length) {
    registerDeviceSessions(payload.sessions)
  }

  fetchData()
}

// 显示设备详情对话框
const showDeviceDetails = (device) => {
  selectedDevice.value = device
  deviceDetailVisible.value = true
  // TODO: 获取设备实时日志
}

// 显示批量升级对话框
const showBatchUpgradeDialog = () => {
  if (!selectedDevices.value || selectedDevices.value.length === 0) {
    toast.error('请先在列表中勾选需要升级的设备', '批量升级')
    return
  }

  upgradeTargetDevices.value = [...selectedDevices.value]
  upgradeDialogVisible.value = true
}

// 显示批量回滚对话框
const showBatchRollbackDialog = () => {
  if (!selectedDevices.value || selectedDevices.value.length === 0) {
    toast.error('请先在列表中勾选需要回滚的设备', '批量回滚')
    return
  }

  rollbackTargetDevices.value = [...selectedDevices.value]
  rollbackDialogVisible.value = true
}

// 跳转到任务管理中心
const goToTaskManagement = () => {
  router.push('/batch-tasks')
}

// 获取设备进度信息
const getDeviceProgress = (deviceId) => {
  // 首先从设备列表数据中获取后端持久化的进度信息
  const device = devices.value.find(d => d.deviceId === deviceId)
  if (device?.currentOperation && device.currentOperation.type) {
    return {
      percent: device.currentOperation.progress || 0,
      status: device.currentOperation.error ? 'exception' : 'active',
      message: device.currentOperation.message || device.currentOperation.step || ''
    }
  }

  // 然后从内存中的实时进度映射获取（兼容Socket事件）
  const progress = deviceProgressMap.get(deviceId)
  if (!progress) return null

  return {
    percent: progress.percent || 0,
    status: progress.status || 'normal',
    message: progress.message || ''
  }
}

// 更新设备进度
const updateDeviceProgress = (deviceId, progressData) => {
  console.log(`💾 存储设备 ${deviceId} 进度:`, progressData)
  const progressInfo = {
    percent: progressData.percent || 0,
    status: progressData.status || 'normal',
    message: progressData.message || '',
    timestamp: Date.now()
  }
  deviceProgressMap.set(deviceId, progressInfo)
  console.log(`📋 当前进度映射大小: ${deviceProgressMap.size}`)
}

// 显示单个设备升级对话框
const showDeviceUpgradeDialog = (device) => {
  upgradeTargetDevices.value = [device]
  upgradeDialogVisible.value = true
}

// 显示单个设备回滚对话框
const showDeviceRollbackDialog = (device) => {
  console.log('showDeviceRollbackDialog: ', device)
  rollbackTargetDevices.value = [device]
  rollbackDialogVisible.value = true
}

// 工具方法
const getStatusLabel = (status) => {
  const labels = {
    online: '在线',
    offline: '离线',
    upgrading: '升级中',
    error: '错误',
    rollback_success: '回滚成功',
    rollback_failed: '回滚失败'
  }
  return labels[status] || status
}

// 格式化日期时间（保留用于表格显示）
const formatDateTime = (timestamp) => {
  if (!timestamp) return '未知'
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// 格式化设备最后活跃时间（优先显示心跳时间，离线时显示断开时间）
const formatLastActiveTime = (device) => {
  if (!device) return '未知'

  // 优先使用最后心跳时间
  if (device.lastHeartbeat) {
    return formatDateTime(device.lastHeartbeat)
  }

  // 如果设备离线且有断开连接时间，使用断开时间
  if (device.status === 'offline' && device.disconnectedAt) {
    return formatDateTime(device.disconnectedAt)
  }

  // 兼容旧版本：检查 lastSeen 字段
  if (device.lastSeen) {
    return formatDateTime(device.lastSeen)
  }

  return '未知'
}

// 生命周期
onMounted(async () => {
  // 启动离线检测
  startOfflineDetection()
  // 启动基于 HTTP 的轮询刷新
  if (pollingTimer) {
    clearInterval(pollingTimer)
  }
  pollingTimer = setInterval(() => {
    fetchData()
  }, 5000)

  // 连接 Socket.IO 并监听进度更新
  console.log('🔗 初始化 Socket.IO 连接')
  socketService.connect()

  socketService.onDeviceProgress((data) => {
    console.log('📊 收到设备进度更新:', data)
    const resolvedDeviceId = resolveProgressDeviceId(data)

    if (resolvedDeviceId) {
      if (data.sessionId && data.deviceId && data.deviceId !== 'unknown') {
        sessionDeviceMap.set(data.sessionId, {
          deviceId: data.deviceId,
          deviceName: ''
        })
      }

      const progressInfo = {
        percent: data.progress || 0,
        status: data.status === 'error' ? 'exception' :
               data.status === 'completed' ? 'success' : 'active',
        message: data.message || data.step || ''
      }
      console.log(`📈 更新设备 ${resolvedDeviceId} 进度:`, progressInfo)
      updateDeviceProgress(resolvedDeviceId, progressInfo)
    } else {
      console.warn('⚠️ 无法解析设备ID，忽略进度更新', data)
    }
  })

  // 加载设备数据
  await fetchData()
})

onUnmounted(() => {
  // 停止离线检测
  stopOfflineDetection()
  // 清理轮询定时器
  if (pollingTimer) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
  // 断开 Socket 连接
  socketService.disconnect()
  // 清理本地会话映射，避免内存泄漏
  sessionDeviceMap.clear()
})

// 格列配置与选择映射
const selectedDeviceKeys = ref([])
// 轮询定时器
let pollingTimer = null

watch(devices, (newDevices) => {
  const availableKeys = newDevices.map((item) => item.deviceId)
  const filteredKeys = selectedDeviceKeys.value.filter((key) => availableKeys.includes(key))
  if (filteredKeys.length !== selectedDeviceKeys.value.length) {
    selectedDeviceKeys.value = filteredKeys
  }
  selectedDevices.value = newDevices.filter((device) => filteredKeys.includes(device.deviceId))
})

const statusColor = (status) => {
  const s = status || 'offline'
  if (s === 'online') return 'green'
  if (s === 'upgrading') return 'blue'
  if (s === 'error') return 'red'
  if (s === 'rollback_success') return 'green'
  if (s === 'rollback_failed') return 'red'
  return 'default'
}

const devicesColumns = [
  { key: 'deviceName', dataIndex: 'deviceName', title: '设备名称', width: 220, fixed: 'left' },
  { key: 'deviceId', dataIndex: 'deviceId', title: '设备ID', width: 220 },
  { key: 'status', dataIndex: 'status', title: '状态', width: 110 },
  { key: 'upgradeProgress', title: '进度展示', align: 'center', width: 220 },
  { key: 'platform', dataIndex: 'platform', title: '运行平台', width: 180 },
  { key: 'network', dataIndex: 'wifiName', title: '网络信息', width: 220 },
  { key: 'ip', dataIndex: 'localIp', title: 'IP 信息', width: 180 },
  { key: 'lastHeartbeat', dataIndex: 'lastHeartbeat', title: '最后心跳', width: 200 },
  { key: 'actions', title: '操作', align: 'center', width: 300, fixed: 'right' }
]

// 选择行
const rowSelection = computed(() => ({
  selectedRowKeys: selectedDeviceKeys.value,
  onChange: (keys, rows) => {
    selectedDeviceKeys.value = keys
    selectedDevices.value = rows
  }
}))

// 分页变化
const handleTableChange = (pag) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchData()
}
</script>

<style scoped>
/* 页面容器样式保持简洁 */
.page-container {
  padding: 24px;
}

/* 进度条样式 */
.progress-container {
  min-width: 120px;
}

.progress-text {
  font-size: 12px;
  color: #666;
  margin-top: 4px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.text-gray-400 {
  color: #9ca3af;
}
</style>
