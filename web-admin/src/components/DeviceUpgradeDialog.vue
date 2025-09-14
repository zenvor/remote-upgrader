<template>
  <a-modal
    v-model:open="open"
    :title="dialogTitle"
    :width="700"
    :maskClosable="false"
    @cancel="cancel"
    destroy-on-close
    ok-text="开始升级"
    cancel-text="取消"
    @ok="handleSubmit"
    :confirm-loading="upgrading"
  >
    <div v-if="targetDevices.length > 0">
      <!-- 目标设备 -->
      <a-card title="目标设备" size="small" :bordered="false" class="info-card">
        <template v-if="targetDevices.length <= 3">
          <a-space direction="vertical" style="width: 100%">
            <div v-for="device in targetDevices" :key="device.deviceId" class="device-item">
              <div class="device-info">
                <div class="device-name">{{ device.deviceName }}</div>
                <div class="device-id">{{ device.deviceId }}</div>
              </div>
              <a-tag :color="getStatusColor(device.status)">
                {{ getStatusLabel(device.status) }}
              </a-tag>
            </div>
          </a-space>
        </template>
        <template v-else>
          <a-statistic :value="targetDevices.length" suffix="台设备" title="批量升级" />
          <div style="margin-top: 12px">
            <a-space>
              <a-tag v-for="status in deviceStatusSummary" :key="status.name" :color="status.color">
                {{ status.name }}: {{ status.count }}
              </a-tag>
            </a-space>
          </div>
        </template>
      </a-card>

      <!-- 升级配置 -->
      <a-card title="升级配置" size="small" :bordered="false" class="info-card">
        <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 18 }">
          <a-form-item label="项目类型">
            <a-radio-group v-model:value="formData.project">
              <a-radio-button
                v-for="project in projectOptions"
                :key="project.value"
                :value="project.value"
              >
                <component :is="project.icon" style="margin-right: 4px" />
                {{ project.label }}
              </a-radio-button>
            </a-radio-group>
          </a-form-item>

          <a-form-item v-if="formData.project" label="升级包">
            <a-select
              v-model:value="formData.packageName"
              :options="availablePackages.map(o => ({ 
                label: `${o.fileName} (${formatFileSize(o.fileSize)})`, 
                value: o.fileName 
              }))"
              :loading="loadingPackages"
              placeholder="选择要部署的包"
              show-search
              :filter-option="filterOption"
            />
          </a-form-item>

          <a-form-item v-if="formData.packageName" label="部署路径">
            <a-input 
              v-model:value="formData.deployPath" 
              placeholder="例如：/opt/frontend 或 /opt/backend"
            />
          </a-form-item>
        </a-form>

        <!-- 包信息 -->
        <div v-if="selectedPackageInfo" style="margin-top: 16px">
          <a-descriptions title="包信息" :column="2" size="small" bordered>
            <a-descriptions-item label="文件名">
              {{ selectedPackageInfo.fileName }}
            </a-descriptions-item>
            <a-descriptions-item label="文件大小">
              {{ formatFileSize(selectedPackageInfo.fileSize) }}
            </a-descriptions-item>
            <a-descriptions-item label="MD5校验" :span="2">
              <span class="md5-text">{{ selectedPackageInfo.fileMD5 }}</span>
            </a-descriptions-item>
          </a-descriptions>
        </div>
      </a-card>

      <!-- 升级选项 -->
      <a-card v-if="formData.packageName" title="升级选项" size="small" :bordered="false" class="info-card">
        <a-space direction="vertical">
          <a-checkbox v-model:checked="formData.options.backup">
            升级前自动备份当前版本
          </a-checkbox>
          <a-checkbox v-model:checked="formData.options.rollbackOnFail">
            升级失败时自动回滚
          </a-checkbox>
          <a-checkbox v-model:checked="formData.options.restartAfterUpgrade">
            升级完成后自动重启服务
          </a-checkbox>
        </a-space>
      </a-card>

      <!-- 预检查结果 -->
      <a-card v-if="preCheckResult" title="预检查结果" size="small" :bordered="false" class="info-card">
        <a-alert
          :type="preCheckResult.success ? 'success' : 'warning'"
          :message="preCheckResult.success ? '预检查通过' : '发现问题'"
          show-icon
        >
          <template #description>
            <div v-for="(message, index) in preCheckResult.messages" :key="index">
              {{ message }}
            </div>
          </template>
        </a-alert>
      </a-card>

      <!-- 预检查按钮 -->
      <div v-if="formData.project && formData.packageName && !preCheckResult" style="text-align: center; margin-top: 16px">
        <a-button @click="runPreCheck" :loading="preChecking">
          预检查
        </a-button>
      </div>
    </div>
  </a-modal>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { usePackages } from '@/composables/usePackages'
import { useDevices } from '@/composables/useDevices'
import toast from '@/utils/toast'
import {
  CloudOutlined,
  HddOutlined
} from '@ant-design/icons-vue'

// Props
const props = defineProps({
  devices: {
    type: Array,
    default: () => []
  },
})

// 使用 defineModel 实现 v-model:open 双向绑定
const open = defineModel('open', { type: Boolean, default: false })

// 内部表单数据管理
const formData = ref({
  // 业务字段：项目类型、包名、部署路径与升级选项
  project: null,
  packageName: null,
  deployPath: '',
  options: {
    backup: true,
    rollbackOnFail: true,
    restartAfterUpgrade: false,
  },
})

// 升级 API（由对话框内部直接提交）
const { upgradeDevice, batchUpgrade } = useDevices()

// 包管理
const { packages, fetchPackages } = usePackages()

// 本地状态（加载/校验）
const loadingPackages = ref(false)
const upgrading = ref(false)
const preChecking = ref(false)
const preCheckResult = ref(null)

// 项目选项
const projectOptions = [
  {
    value: 'frontend',
    label: '前端项目',
    description: 'Web 用户界面',
    color: '#3B82F6',
    icon: CloudOutlined
  },
  {
    value: 'backend',
    label: '后端项目',
    description: '服务器端应用',
    color: '#10B981',
    icon: HddOutlined
  }
]

// 计算属性
const targetDevices = computed(() => props.devices)

const dialogTitle = computed(() => {
  const deviceCount = targetDevices.value.length
  if (deviceCount === 0) return '设备升级'
  if (deviceCount === 1) return `升级设备 - ${targetDevices.value[0].deviceName}`
  return `批量升级 - ${deviceCount} 个设备`
})

const availablePackages = computed(() => {
  if (!formData.value?.project) return []
  
  return packages.value
    .filter(pkg => pkg.project === formData.value.project)
    .map(pkg => ({
      ...pkg,
      displayName: `${pkg.fileName} (v${pkg.version || '未知'})`
    }))
    .sort((a, b) => (b.fileName || '').localeCompare(a.fileName || ''))
})

const selectedPackageInfo = computed(() => {
  if (!formData.value?.packageName) return null
  return availablePackages.value.find(pkg => pkg.fileName === formData.value.packageName)
})

const canUpgrade = computed(() => {
  return formData.value?.project && 
         formData.value?.packageName && 
         targetDevices.value.length > 0 &&
         !upgrading.value
})

// 设备状态统计
const deviceStatusSummary = computed(() => {
  const statusCount = {}
  targetDevices.value.forEach(device => {
    const status = device.status
    statusCount[status] = (statusCount[status] || 0) + 1
  })
  
  return Object.entries(statusCount).map(([status, count]) => ({
    name: getStatusLabel(status),
    count,
    color: getStatusColor(status)
  }))
})

// 监听项目变化，清空包选择并设置默认部署路径
watch(() => formData.value?.project, () => {
  if (!formData.value) return
  formData.value.packageName = null
  preCheckResult.value = null
  // 为不同项目设置一个合理默认路径
  formData.value.deployPath = formData.value.project === 'frontend' ? '/opt/frontend' : '/opt/backend'
})

// 重置表单到初始状态
const resetForm = () => {
  formData.value = {
    project: null,
    packageName: null,
    deployPath: '',
    options: {
      backup: true,
      rollbackOnFail: true,
      restartAfterUpgrade: false,
    },
  }
}

// 监听对话框可见性，加载包列表和重置表单
watch(() => open.value, async (visible) => {
  if (visible) {
    // 重置表单和状态
    resetForm()
    preCheckResult.value = null
    upgrading.value = false
    preChecking.value = false
    
    loadingPackages.value = true
    try {
      await fetchPackages()
    } catch (error) {
      console.error('加载包列表失败:', error)
      toast.error('加载包列表失败', '错误')
    } finally {
      loadingPackages.value = false
    }
  }
})

// 方法
const runPreCheck = async () => {
  if (!selectedPackageInfo.value || targetDevices.value.length === 0) return
  
  preChecking.value = true
  try {
    // 模拟预检查
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    const messages = []
    let success = true
    
    // 检查设备状态
    const offlineDevices = targetDevices.value.filter(d => d.status !== 'online')
    if (offlineDevices.length > 0) {
      messages.push(`${offlineDevices.length} 个设备离线，无法升级`)
      success = false
    }
    
    // 检查磁盘空间（模拟）
    const needSpace = selectedPackageInfo.value.fileSize * 2 // 需要2倍空间用于备份
    messages.push(`升级包大小: ${formatFileSize(selectedPackageInfo.value.fileSize)}`)
    messages.push(`预计需要磁盘空间: ${formatFileSize(needSpace)}`)
    
    // 检查版本兼容性（模拟）
    if (Math.random() > 0.8) {
      messages.push('警告: 检测到版本兼容性问题，建议谨慎升级')
      success = false
    } else {
      messages.push('版本兼容性检查通过')
    }
    
    preCheckResult.value = {
      success,
      messages
    }
    
  } catch (error) {
    console.error('预检查失败:', error)
    toast.error('预检查失败', '错误')
    preCheckResult.value = {
      success: false,
      messages: ['预检查失败，请重试']
    }
  } finally {
    preChecking.value = false
  }
}

/** 提交升级（与 @ok 绑定） */
const handleSubmit = async () => {
  if (!canUpgrade.value) return
  
  upgrading.value = true
  try {
    const project = formData.value.project
    const packageInfo = selectedPackageInfo.value
    const options = { ...formData.value.options, deployPath: formData.value.deployPath }
    const target = targetDevices.value

    if (target.length === 1) {
      await upgradeDevice(target[0], project, packageInfo, options)
      toast.success(`设备 "${target[0].deviceName}" 升级操作已启动`, '升级开始')
    } else {
      await batchUpgrade(target, project, packageInfo, options)
      toast.success(`批量升级操作已启动，共 ${target.length} 个设备`, '批量升级')
    }

    // 关闭对话框
    open.value = false
    
  } catch (error) {
    console.error('升级失败:', error)
    toast.error('升级操作失败', '错误')
  } finally {
    upgrading.value = false
  }
}

/** 取消并关闭弹窗 */
const cancel = () => {
  open.value = false
}

// 工具方法
const getStatusLabel = (status) => {
  const labels = {
    'online': '在线',
    'offline': '离线',
    'upgrading': '升级中',
    'error': '错误'
  }
  return labels[status] || status
}

const getStatusSeverity = (status) => {
  const severities = {
    'online': 'success',
    'offline': 'secondary',
    'upgrading': 'info',
    'error': 'danger'
  }
  return severities[status] || 'secondary'
}

// 获取状态对应的颜色
const getStatusColor = (status) => {
  const colors = {
    'online': 'success',
    'offline': 'default',
    'upgrading': 'processing',
    'error': 'error'
  }
  return colors[status] || 'default'
}

// 包过滤函数
const filterOption = (input, option) => {
  return option.label.toLowerCase().indexOf(input.toLowerCase()) >= 0
}

const formatFileSize = (bytes) => {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// no upload time display
</script>

<style scoped lang="less">
.info-card {
  margin-bottom: 16px;
  
  :deep(.ant-card-head) {
    background: #fafafa;
  }
}

.device-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
  
  &:last-child {
    border-bottom: none;
  }
  
  .device-info {
    .device-name {
      font-weight: 500;
      color: #262626;
    }
    
    .device-id {
      font-size: 12px;
      color: #8c8c8c;
      font-family: monospace;
    }
  }
}

.md5-text {
  font-family: monospace;
  font-size: 12px;
  word-break: break-all;
}
</style>
