<template>
  <div class="page-container">
    <!-- 统计卡片（AntD Grid + Card） -->
    <a-row :gutter="16" style="margin-bottom: 24px">
      <a-col :xs="12" :sm="6" :md="6" :lg="6" :xl="6">
        <a-card :bordered="false">
          <div class="flex items-center">
            <CheckCircleIcon class="mr-2 text-green-600" style="font-size: 22px" />
            <div>
              <div class="text-gray-500">在线设备</div>
              <div class="text-xl font-semibold">{{ deviceStats.online }}</div>
            </div>
          </div>
        </a-card>
      </a-col>
      <a-col :xs="12" :sm="6" :md="6" :lg="6" :xl="6">
        <a-card :bordered="false">
          <div class="flex items-center">
            <CloseCircleIcon class="mr-2 text-red-600" style="font-size: 22px" />
            <div>
              <div class="text-gray-500">离线设备</div>
              <div class="text-xl font-semibold">{{ deviceStats.offline }}</div>
            </div>
          </div>
        </a-card>
      </a-col>
      <a-col :xs="12" :sm="6" :md="6" :lg="6" :xl="6">
        <a-card :bordered="false">
          <div class="flex items-center">
            <UploadIcon class="mr-2 text-blue-600" style="font-size: 22px" />
            <div>
              <div class="text-gray-500">升级中</div>
              <div class="text-xl font-semibold">{{ deviceStats.upgrading }}</div>
            </div>
          </div>
        </a-card>
      </a-col>
      <a-col :xs="12" :sm="6" :md="6" :lg="6" :xl="6">
        <a-card :bordered="false">
          <div class="flex items-center">
            <ServerIcon class="mr-2 text-gray-600" style="font-size: 22px" />
            <div>
              <div class="text-gray-500">总设备数</div>
              <div class="text-xl font-semibold">{{ devices.length }}</div>
            </div>
          </div>
        </a-card>
      </a-col>
    </a-row>

    <a-card :bordered="false" :bodyStyle="{ padding: '0 20px' }">
      <OperationBar
        :title="'设备管理'"
        :selected-count="selectedDevices.length"
        :total="total"
        :show-total="true"
        @refresh="fetchData(true)"
      >
        <template #title>
          <a-space align="center">
            <span>设备管理</span>
            <a-tag :color="isConnected ? 'success' : 'error'">
              <template #icon>
                <a-badge :dot="true" :color="isConnected ? '#52c41a' : '#ff4d4f'" />
              </template>
              {{ isConnected ? '实时连接正常' : '实时连接断开' }}
            </a-tag>
          </a-space>
        </template>
        <template #actions>
          <a-button type="primary" :disabled="!hasSelected" @click="showBatchUpgradeDialog">
            <UploadIcon />
            <span style="margin-left: 4px">批量升级</span>
          </a-button>
          <a-button @click="showBatchConfigDialog" :disabled="!canBatchConfig">
            <SettingIcon />
            <span style="margin-left: 4px">批量配置</span>
          </a-button>
          <a-button danger ghost @click="showBatchRollbackDialog" :disabled="!hasSelected">
            <RefreshIcon />
            <span style="margin-left: 4px">批量回滚</span>
          </a-button>
        </template>
      </OperationBar>

      <!-- 配置提醒 -->
      <a-alert
        v-if="devicesNeedingConfig.length > 0"
        type="warning"
        message="需要配置原部署目录路径"
        :description="`${devicesNeedingConfig.length} 个设备尚未配置原部署目录路径，升级功能可能受到影响`"
        show-icon
        style="margin-bottom: 24px"
      >
      </a-alert>

      <!-- 设备列表 -->
      <a-table
        :dataSource="devices"
        :columns="devicesColumns"
        :loading="tableLoading || loading"
        rowKey="deviceId"
        :rowSelection="rowSelection"
        :pagination="pagination"
        :scroll="{ x: 1400 }"
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
                <div v-if="checkDeviceNeedsConfig(record)" class="flex items-center text-xs text-orange-600">
                  <ErrorTriangleIcon class="mr-1" />
                  需要配置部署路径
                </div>
              </div>
            </div>
          </template>

          <!-- 状态列 -->
          <template v-else-if="column.key === 'status'">
            <a-tag :color="statusColor(record.status)">{{ getStatusLabel(record.status) }}</a-tag>
          </template>

          <!-- Wi‑Fi 列 -->
          <template v-else-if="column.key === 'wifi'">
            <span class="text-sm text-gray-600">
              {{
                (record.wifiName || '-') +
                ' (' +
                (typeof record.wifiSignal === 'number' ? record.wifiSignal + ' dBm' : '-') +
                ')'
              }}
            </span>
          </template>

          <!-- 公网IP列 -->
          <template v-else-if="column.key === 'publicIp'">
            <span class="text-sm text-gray-700 font-mono">
              {{ record.publicIp || '获取中...' }}
            </span>
          </template>

          <!-- 版本信息列 -->
          <template v-else-if="column.key === 'versions'">
            <div class="text-xs text-gray-700">
              <span>前端: {{ record.versions?.frontend || '未部署' }}</span>
              <span class="mx-2">|</span>
              <span>后端: {{ record.versions?.backend || '未部署' }}</span>
            </div>
          </template>

          <!-- 操作列 -->
          <template v-else-if="column.key === 'actions'">
            <a-space>
              <a-button size="small" @click="showDeviceDetails(record)">
                <EyeOutlined />
                详情
              </a-button>
              <a-button size="small" @click="showDeviceConfigDialog(record)">
                <SettingIcon />
                配置
              </a-button>
              <a-button :disabled="checkDeviceNeedsConfig(record)" size="small" type="primary" @click="showDeviceUpgradeDialog(record)">
                <RocketOutlined />
                升级
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
    />

    <!-- 设备配置对话框 -->
    <DeviceConfigDialog
      v-model:open="configDialogVisible"
      :device="configDevice"
      @success="handleConfigSuccess"
    />

    <!-- 设备详情对话框 -->
    <a-modal
      v-model:open="deviceDetailVisible"
      :title="`设备详情 - ${selectedDevice?.deviceName}`"
      :width="1000"
      :maskClosable="false"
      :footer="null"
      class="device-detail-modal"
    >
      <div v-if="selectedDevice" class="device-detail-content">
        <!-- 设备基本信息 -->
        <div class="detail-section">
          <div class="detail-card basic-info">
            <div class="card-header">
              <ServerIcon class="header-icon" />
              <h4 class="header-title">基本信息</h4>
            </div>
            <div class="card-content">
              <div class="info-item">
                <span class="info-label">设备名称</span>
                <span class="info-value name">{{ selectedDevice.deviceName }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">设备ID</span>
                <span class="info-value code">{{ selectedDevice.deviceId }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">状态</span>
                <a-tag :color="statusColor(selectedDevice.status)" class="status-tag">
                  {{ getStatusLabel(selectedDevice.status) }}
                </a-tag>
              </div>
              <div class="info-item">
                <span class="info-label">运行平台</span>
                <span class="info-value">{{ selectedDevice.platform || '未知' }}</span>
              </div>
            </div>
          </div>

          <div class="detail-card version-info">
            <div class="card-header">
              <UploadIcon class="header-icon" />
              <h4 class="header-title">版本信息</h4>
            </div>
            <div class="card-content">
              <div class="info-item">
                <span class="info-label">客户端版本</span>
                <span class="info-value version">{{ selectedDevice.version || '未知' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">前端版本</span>
                <span class="info-value version">{{ selectedDevice.versions?.frontend || '未部署' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">后端版本</span>
                <span class="info-value version">{{ selectedDevice.versions?.backend || '未部署' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Agent版本</span>
                <span class="info-value version">{{ selectedDevice.agentVersion || '未知' }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 网络信息和连接状态 -->
        <div class="detail-section">
          <div class="detail-card network-info">
            <div class="card-header">
              <WifiOutlined class="header-icon" />
              <h4 class="header-title">网络信息</h4>
            </div>
            <div class="card-content">
              <div class="info-item">
                <span class="info-label">WiFi名称</span>
                <span class="info-value">{{ selectedDevice.wifiName || '未连接' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">信号强度</span>
                <div class="signal-info">
                  <span class="info-value">{{
                    selectedDevice.wifiSignal ? `${selectedDevice.wifiSignal} dBm` : '未知'
                  }}</span>
                  <span
                    v-if="selectedDevice.wifiSignal"
                    class="signal-badge"
                    :class="getWifiSignalClass(selectedDevice.wifiSignal)"
                  >
                    {{ getWifiSignalLabel(selectedDevice.wifiSignal) }}
                  </span>
                </div>
              </div>
              <div class="info-item">
                <span class="info-label">公网IP</span>
                <span class="info-value code">{{ selectedDevice.publicIp || '获取中...' }}</span>
              </div>
            </div>
          </div>

          <div class="detail-card connect-info">
            <div class="card-header">
              <ClockCircleOutlined class="header-icon" />
              <h4 class="header-title">连接状态</h4>
            </div>
            <div class="card-content">
              <div class="info-item">
                <span class="info-label">连接时间</span>
                <span class="info-value">{{ formatDateTime(selectedDevice.connectedAt) }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">最后心跳</span>
                <span class="info-value">{{ formatDateTime(selectedDevice.lastHeartbeat) }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">在线时长</span>
                <span class="info-value duration">{{ calculateOnlineTime(selectedDevice.connectedAt) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 部署配置 -->
        <div class="detail-section single">
          <div class="detail-card deploy-info">
            <div class="card-header">
              <FolderOutlined class="header-icon" />
              <h4 class="header-title">部署配置</h4>
            </div>
            <div class="card-content">
              <div class="info-item path-item">
                <span class="info-label">部署路径</span>
                <span class="info-value path">{{ selectedDevice.deployPath || '未配置' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">配置状态</span>
                <a-tag :color="selectedDevice.hasDeployPath ? 'success' : 'warning'" class="status-tag">
                  {{ selectedDevice.hasDeployPath ? '已配置' : '未配置' }}
                </a-tag>
              </div>
            </div>
          </div>
        </div>

        <!-- 实时日志 -->
        <div class="detail-section single">
          <div class="detail-card logs-info">
            <div class="card-header">
              <FileTextOutlined class="header-icon" />
              <h4 class="header-title">实时日志</h4>
            </div>
            <div class="log-container">
              <div v-for="(log, index) in deviceLogs" :key="index" class="log-entry">
                <span class="log-time">[{{ formatLogTime(log.timestamp) }}]</span>
                <span class="log-level" :class="getLogLevelClass(log.level)">{{ log.level.toUpperCase() }}</span>
                <span class="log-message">{{ log.message }}</span>
              </div>
              <div v-if="deviceLogs.length === 0" class="log-empty">暂无日志信息...</div>
            </div>
          </div>
        </div>
      </div>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
// Use TDesign table via columns config
import {
  WarningOutlined as ErrorTriangleIcon,
  CheckCircleOutlined as CheckCircleIcon,
  CloseCircleOutlined as CloseCircleIcon,
  UploadOutlined as UploadIcon,
  HddOutlined as ServerIcon,
  ReloadOutlined as RefreshIcon,
  SettingOutlined as SettingIcon,
  EyeOutlined,
  RocketOutlined,
  WifiOutlined,
  ClockCircleOutlined,
  FolderOutlined,
  FileTextOutlined,
} from '@ant-design/icons-vue'
import DeviceUpgradeDialog from '@/components/DeviceUpgradeDialog.vue'
import DeviceConfigDialog from '@/components/DeviceConfigDialog.vue'
import OperationBar from '@/components/OperationBar.vue'
import { useDevices } from '@/composables/useDevices'

// 数据状态
const {
  devices,
  total,
  selectedDevices,
  loading,
  deviceLogs,
  fetchDevices,
  startOfflineDetection,
  stopOfflineDetection,
  isConnected,
  getDevicesNeedingConfig,
  checkDeviceNeedsConfig,
} = useDevices()

// 分页状态
const tableLoading = ref(false)
const deviceDetailVisible = ref(false)
const selectedDevice = ref(null)

// 分页配置
const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条/共 ${total} 条`,
})

// 升级对话框状态
const upgradeDialogVisible = ref(false)
const upgradeTargetDevices = ref([])

// 配置对话框状态
const configDialogVisible = ref(false)
const configDevice = ref(null)

// 设备统计
const deviceStats = computed(() => {
  const online = devices.value.filter((d) => d.status === 'online').length
  const offline = devices.value.filter((d) => d.status === 'offline').length
  const upgrading = devices.value.filter((d) => d.status === 'upgrading').length

  return { online, offline, upgrading }
})

// 需要配置的设备列表
const devicesNeedingConfig = computed(() => {
  return getDevicesNeedingConfig()
})

// 是否有选中项（基于选中 keys）
const hasSelected = computed(() => selectedDeviceKeys.value.length > 0)
// 能否批量配置（存在需要配置的设备）
const canBatchConfig = computed(() => devicesNeedingConfig.value.length > 0)

// 获取设备列表
const fetchData = async () => {
  try {
    tableLoading.value = true
    const params = {
      pageNum: pagination.current,
      pageSize: pagination.pageSize,
    }
    await fetchDevices(params)
  } finally {
    tableLoading.value = false
  }
}

fetchData()

// 显示设备详情对话框
const showDeviceDetails = (device) => {
  selectedDevice.value = device
  deviceDetailVisible.value = true
  // TODO: 获取设备实时日志
}

// 显示批量升级对话框
const showBatchUpgradeDialog = () => {
  upgradeTargetDevices.value = [...selectedDevices.value]
  upgradeDialogVisible.value = true
}

const showBatchRollbackDialog = () => {
  // TODO: 显示批量回滚对话框
}

// 显示设备配置对话框
const showDeviceConfigDialog = (device) => {
  configDevice.value = device
  configDialogVisible.value = true
}

// 子组件配置成功后刷新列表
const handleConfigSuccess = async () => {
  await fetchData()
}

// 显示批量配置对话框
const showBatchConfigDialog = () => {
  if (!canBatchConfig.value) return
  // 选择第一个需要配置的设备开始
  showDeviceConfigDialog(devicesNeedingConfig.value[0])
}

// 显示单个设备升级对话框
const showDeviceUpgradeDialog = (device) => {
  console.log('showDeviceUpgradeDialog: ', device);
  upgradeTargetDevices.value = [device]
  upgradeDialogVisible.value = true
}

// 升级提交逻辑已迁移到 DeviceUpgradeDialog 内部

// 工具方法
const getStatusLabel = (status) => {
  const labels = {
    online: '在线',
    offline: '离线',
    upgrading: '升级中',
    error: '错误',
  }
  return labels[status] || status
}

const formatLogTime = (timestamp) => {
  return new Date(timestamp).toLocaleTimeString('zh-CN')
}

const getLogLevelClass = (level) => {
  const classes = {
    error: 'text-red-400',
    warn: 'text-yellow-400',
    info: 'text-blue-400',
    debug: 'text-gray-400',
  }
  return classes[level] || 'text-green-400'
}

// 格式化日期时间
const formatDateTime = (timestamp) => {
  if (!timestamp) return '未知'
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

// 计算在线时长
const calculateOnlineTime = (connectedAt) => {
  if (!connectedAt) return '未知'
  const now = new Date()
  const connected = new Date(connectedAt)
  const diff = now - connected

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  if (days > 0) {
    return `${days}天${hours}小时`
  } else if (hours > 0) {
    return `${hours}小时${minutes}分钟`
  } else {
    return `${minutes}分钟`
  }
}

// WiFi信号强度标签
const getWifiSignalLabel = (signal) => {
  if (signal >= -50) return '优秀'
  if (signal >= -60) return '良好'
  if (signal >= -70) return '一般'
  return '较弱'
}

// WiFi信号强度样式类
const getWifiSignalClass = (signal) => {
  if (signal >= -50) return 'bg-green-100 text-green-800'
  if (signal >= -60) return 'bg-blue-100 text-blue-800'
  if (signal >= -70) return 'bg-yellow-100 text-yellow-800'
  return 'bg-red-100 text-red-800'
}

// 生命周期
onMounted(async () => {
  // 启动离线检测
  startOfflineDetection()
})

onUnmounted(() => {
  // 停止离线检测
  stopOfflineDetection()
})

// 格列配置与选择映射
const selectedDeviceKeys = ref([])

const statusColor = (status) => {
  const s = status || 'offline'
  if (s === 'online') return 'green'
  if (s === 'upgrading') return 'blue'
  if (s === 'error') return 'red'
  return 'default'
}

const devicesColumns = [
  { key: 'deviceName', dataIndex: 'deviceName', title: '设备名称' },
  { key: 'deviceId', dataIndex: 'deviceId', title: '设备ID' },
  { key: 'status', dataIndex: 'status', title: '状态' },
  { key: 'wifi', dataIndex: 'wifiSignal', title: 'Wi‑Fi' },
  { key: 'publicIp', dataIndex: 'publicIp', title: '公网IP' },
  { key: 'versions', dataIndex: 'versions', title: '版本信息' },
  {
    key: 'actions',
    title: '操作',
    align: 'center',
    width: 230,
    fixed: 'right',
  },
]

// 选择行
const rowSelection = computed(() => ({
  selectedRowKeys: selectedDeviceKeys.value,
  onChange: (keys) => (selectedDeviceKeys.value = keys),
}))

// 分页变化
const handleTableChange = (pag) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchData()
}
</script>

<style scoped>
/* 设备详情对话框样式 */
.device-detail-content {
  padding: 8px 0;
}

.detail-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 24px;
}

.detail-section.single {
  grid-template-columns: 1fr;
}

.detail-card {
  background: #ffffff;
  border: 1px solid #e8e8e8;
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.3s ease;
}

.detail-card:hover {
  border-color: #d9d9d9;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

/* 卡片头部 */
.card-header {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  background: linear-gradient(135deg, #f5f5f5 0%, #fafafa 100%);
  border-bottom: 1px solid #e8e8e8;
}

.header-icon {
  font-size: 18px;
  margin-right: 8px;
}

.basic-info .header-icon {
  color: #1890ff;
}
.version-info .header-icon {
  color: #52c41a;
}
.network-info .header-icon {
  color: #722ed1;
}
.connect-info .header-icon {
  color: #13c2c2;
}
.deploy-info .header-icon {
  color: #fa8c16;
}
.logs-info .header-icon {
  color: #595959;
}

.header-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #262626;
}

/* 卡片内容 */
.card-content {
  padding: 20px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
}

.info-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.info-label {
  font-size: 14px;
  color: #8c8c8c;
  font-weight: 500;
  min-width: 80px;
}

.info-value {
  font-size: 14px;
  color: #262626;
  font-weight: 500;
  text-align: right;
  word-break: break-all;
}

.info-value.name {
  color: #1890ff;
  font-weight: 600;
}

.info-value.code {
  font-family: 'Monaco', 'Menlo', monospace;
  background: #f5f5f5;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.info-value.version {
  font-family: 'Monaco', 'Menlo', monospace;
  color: #52c41a;
  font-weight: 600;
}

.info-value.duration {
  color: #13c2c2;
  font-weight: 600;
}

.info-value.path {
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 12px;
  flex: 1;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 部署路径特殊布局 */
.path-item {
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.path-item .info-label {
  min-width: auto;
}

.path-item .info-value {
  width: 100%;
  text-align: left;
  background: #f8f8f8;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #e8e8e8;
  word-break: break-all;
  white-space: normal;
  font-size: 13px;
}

/* 信号强度特殊样式 */
.signal-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.signal-badge {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
}

/* 状态标签 */
.status-tag {
  border-radius: 6px;
  font-weight: 500;
}

/* 日志容器 */
.log-container {
  background: #1f1f1f;
  border-radius: 8px;
  padding: 16px;
  max-height: 280px;
  overflow-y: auto;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 13px;
  line-height: 1.6;
}

.log-entry {
  margin-bottom: 4px;
  word-break: break-all;
}

.log-time {
  color: #666;
  margin-right: 8px;
}

.log-level {
  margin-right: 8px;
  font-weight: 600;
  min-width: 60px;
  display: inline-block;
}

.log-message {
  color: #e6e6e6;
}

.log-empty {
  color: #888;
  text-align: center;
  padding: 20px;
}

/* 模态框底部 */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* 响应式 */
@media (max-width: 768px) {
  .detail-section {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .info-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .info-value {
    text-align: left;
  }
}

/* 滚动条样式 */
.log-container::-webkit-scrollbar {
  width: 6px;
}

.log-container::-webkit-scrollbar-track {
  background: #2a2a2a;
  border-radius: 3px;
}

.log-container::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 3px;
}

.log-container::-webkit-scrollbar-thumb:hover {
  background: #777;
}
</style>
