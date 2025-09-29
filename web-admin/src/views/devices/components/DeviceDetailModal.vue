<template>
  <a-modal
    v-model:open="open"
    :title="`设备详情 - ${device?.deviceName}`"
    :width="1000"
    :mask-closable="false"
    :footer="null"
    class="device-detail-modal"
  >
    <div v-if="device" class="device-detail-content">
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
              <span class="info-value name">{{ device.deviceName }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">设备ID</span>
              <span class="info-value code">{{ device.deviceId }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">状态</span>
              <a-tag style="margin: 0" :color="statusColor(device.status)" class="status-tag">
                {{ getStatusLabel(device.status) }}
              </a-tag>
            </div>
            <div class="info-item">
              <span class="info-label">运行平台</span>
              <span class="info-value">{{ device.platform || '未知' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">系统版本</span>
              <span class="info-value">{{ device.osVersion || '未知' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">系统架构</span>
              <span class="info-value">{{ device.arch || '未知' }}</span>
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
              <span class="info-label">前端版本</span>
              <span class="info-value version">
                {{ device.frontendVersion || '未部署' }}
              </span>
            </div>
            <div class="info-item">
              <span class="info-label">前端部署路径</span>
              <span class="info-value code">
                {{ device.frontendDeployPath || '未配置' }}
              </span>
            </div>
            <div class="info-item">
              <span class="info-label">前端部署时间</span>
              <span class="info-value">
                {{ formatDateTime(device.deployInfo?.frontend?.deployDate) }}
              </span>
            </div>
            <div class="info-item">
              <span class="info-label">后端版本</span>
              <span class="info-value version">
                {{ device.backendVersion || '未部署' }}
              </span>
            </div>
            <div class="info-item">
              <span class="info-label">后端部署路径</span>
              <span class="info-value code">
                {{ device.backendDeployPath || '未配置' }}
              </span>
            </div>
            <div class="info-item">
              <span class="info-label">后端部署时间</span>
              <span class="info-value">
                {{ formatDateTime(device.deployInfo?.backend?.deployDate) }}
              </span>
            </div>
            <div class="info-item">
              <span class="info-label">Agent版本</span>
              <span class="info-value version">{{ device.agentVersion || '未知' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">部署能力</span>
              <a-tag style="margin: 0" :color="device.hasDeployPath ? 'green' : 'default'">
                {{ device.hasDeployPath ? '已配置' : '未配置' }}
              </a-tag>
            </div>
            <div class="info-item">
              <span class="info-label">回滚能力</span>
              <a-tag style="margin: 0" :color="device.rollbackAvailable ? 'green' : 'default'">
                {{ device.rollbackAvailable ? '可回滚' : '不可回滚' }}
              </a-tag>
            </div>
          </div>
        </div>
      </div>

      <!-- 系统资源和连接状态 -->
      <div class="detail-section">
        <div class="detail-card system-info">
          <div class="card-header">
            <ServerIcon class="header-icon" />
            <h4 class="header-title">系统资源</h4>
          </div>
          <div class="card-content">
            <div class="info-item">
              <span class="info-label">系统运行时长</span>
              <span class="info-value duration">{{ formatDuration(device.uptimeSeconds) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">连接时间</span>
              <span class="info-value">{{ formatDateTime(device.connectedAt) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">最后心跳</span>
              <span class="info-value">{{ formatDateTime(device.lastHeartbeat) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">断开时间</span>
              <span class="info-value">{{ formatDateTime(device.disconnectedAt) }}</span>
            </div>
          </div>
        </div>

        <div class="detail-card network-info">
          <div class="card-header">
            <WifiOutlined class="header-icon" />
            <h4 class="header-title">网络信息</h4>
          </div>
          <div class="card-content">
            <div class="info-item">
              <span class="info-label">WiFi名称</span>
              <span class="info-value">{{ device.wifiName || '未连接' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">内网IP</span>
              <span class="info-value code">{{ device.localIp || '未知' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">MAC地址</span>
              <span class="info-value">{{
                device.macAddresses?.length ? device.macAddresses.join('、') : '未知'
              }}</span>
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
</template>

<script setup>
import {
  HddOutlined as ServerIcon,
  UploadOutlined as UploadIcon,
  WifiOutlined,
  FileTextOutlined
} from '@ant-design/icons-vue'

// Props
defineProps({
  device: {
    type: Object,
    default: null
  },
  deviceLogs: {
    type: Array,
    default: () => []
  }
})

// 使用 defineModel 实现 v-model:open 双向绑定
const open = defineModel('open', { type: Boolean, default: false })

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

const statusColor = (status) => {
  const s = status || 'offline'
  if (s === 'online') return 'green'
  if (s === 'upgrading') return 'blue'
  if (s === 'error') return 'red'
  if (s === 'rollback_success') return 'green'
  if (s === 'rollback_failed') return 'red'
  return 'default'
}

const formatLogTime = (timestamp) => {
  return new Date(timestamp).toLocaleTimeString('zh-CN')
}

const getLogLevelClass = (level) => {
  const classes = {
    error: 'text-red-400',
    warn: 'text-yellow-400',
    info: 'text-blue-400',
    debug: 'text-gray-400'
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
    second: '2-digit'
  })
}

// 将秒数格式化为可读时长
const formatDuration = (totalSeconds) => {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '未知'
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (days > 0) {
    return `${days}天${hours}小时`
  }
  if (hours > 0) {
    return `${hours}小时${minutes}分钟`
  }
  return `${minutes}分钟`
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
.system-info .header-icon {
  color: #fa8c16;
}
.network-info .header-icon {
  color: #722ed1;
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
