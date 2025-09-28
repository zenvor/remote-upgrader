<template>
  <a-modal
    v-model:open="open"
    :title="dialogTitle"
    :width="700"
    :mask-closable="false"
    destroy-on-close
    ok-text="开始升级"
    cancel-text="取消"
    :confirm-loading="upgrading"
    @cancel="cancel"
    @ok="handleSubmit"
  >
    <div>
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
        <a-form ref="upgradeFormRef" :model="formData" :label-col="{ span: 6 }" :wrapper-col="{ span: 18 }">
          <a-form-item
            label="项目类型"
            name="project"
            :rules="[{ required: true, message: '请选择项目类型', trigger: 'change' }]"
          >
            <a-radio-group
              v-model:value="formData.project"
              :rules="[{ required: true, message: '请选择项目类型', trigger: 'change' }]"
            >
              <a-radio-button v-for="project in projectOptions" :key="project.value" :value="project.value">
                <component :is="project.icon" style="margin-right: 4px" />
                {{ project.label }}
              </a-radio-button>
            </a-radio-group>
          </a-form-item>

          <a-form-item
            label="升级包"
            name="packageName"
            :rules="[{ required: true, message: '请选择升级包', trigger: 'change' }]"
          >
            <a-select
              v-model:value="formData.packageName"
              :options="
                availablePackages.map((o) => ({
                  label: o.displayName,
                  value: o.id
                }))
              "
              :loading="loadingPackages"
              placeholder="选择要部署的包"
              show-search
              :filter-option="filterOption"
            />
          </a-form-item>

          <a-form-item :disabled="!formData.packageName" label="部署路径" name="deployPath">
            <a-input v-model:value="formData.deployPath" placeholder="例如：/opt/frontend 或 /opt/backend" />
          </a-form-item>

          <!-- 配置来源选择器 -->
          <a-form-item-rest v-if="hasMultipleConfigSources">
            <div style="margin-bottom: 8px; padding-left: 150px">
              <a-space align="center">
                <span style="font-size: 12px; color: #666">配置来源：</span>
                <a-switch v-model:checked="useBackendConfig" size="small" :disabled="!hasBackendConfig">
                  <template #checkedChildren>后端</template>
                  <template #unCheckedChildren>环境</template>
                </a-switch>
                <a-tag size="small" :color="useBackendConfig ? 'blue' : 'green'">
                  {{ useBackendConfig ? '后端配置' : '环境变量' }}
                </a-tag>
              </a-space>
            </div>
          </a-form-item-rest>

          <!-- 保护文件选择 -->
          <a-form-item :disabled="!formData.packageName" label="保护文件" name="preservedPaths">
            <a-select
              v-model:value="formData.preservedPaths"
              mode="tags"
              placeholder="输入需要保护的文件或目录，避免被删除和覆盖"
              :options="commonPreservedPaths"
              style="width: 100%"
              :max-tag-count="20"
              allow-clear
            >
              <template #suffixIcon>
                <SafetyOutlined />
              </template>
            </a-select>

            <div style="margin-top: 4px; font-size: 12px; color: #666">
              <div>
                示例：<a-tag size="small">.env</a-tag> <a-tag size="small">config/</a-tag>
                <a-tag size="small">logs/</a-tag>
              </div>
              <div style="margin-top: 2px">💡 白名单文件在升级时不会被删除或覆盖，确保服务正常运行</div>
              <div
                v-if="!hasMultipleConfigSources && preservedPathsSource && preservedPathsSource !== '无配置'"
                style="margin-top: 2px"
              >
                🔧 配置来源：<a-tag size="small" :color="preservedPathsSource === '后端配置' ? 'blue' : 'green'">
                  {{ preservedPathsSource }}
                </a-tag>
              </div>
            </div>
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
    </div>
  </a-modal>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { deviceApi, packageApi, batchApi } from '@/api'
import toast from '@/utils/toast'
import { CloudOutlined, HddOutlined, SafetyOutlined } from '@ant-design/icons-vue'
import { generateSessionId } from '@/utils/progressTypes.js'
import { Modal } from 'ant-design-vue'
import { resolveDevicePreservedPaths, getPreservedPathsSource, getEnvPreservedPaths } from '@/utils/deployConfig.js'

// Props
const props = defineProps({
  devices: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['success'])

// 使用 defineModel 实现 v-model:open 双向绑定
const open = defineModel('open', { type: Boolean, default: false })

// 内部表单数据管理
const formData = ref({
  // 业务字段：项目类型、包名、部署路径、白名单
  project: 'frontend',
  packageName: null,
  deployPath: '',
  preservedPaths: [],
  options: {
    backup: true,
    rollbackOnFail: true,
    restartAfterUpgrade: false
  }
})

// 升级表单引用
const upgradeFormRef = ref(null)

// 升级设备
const upgradeDevice = async (device, project, packageInfo = null, options = {}) => {
  try {
    // 如果没有指定包信息，需要先选择包
    if (!packageInfo) {
      console.log(`升级设备 ${device.deviceName} 的 ${project} 项目`)
      return
    }

    // 生成会话ID用于进度跟踪
    const sessionId = generateSessionId()
    console.log(`🚀 开始升级设备 ${device.deviceName}，会话ID: ${sessionId}`)

    const upgradeData = {
      project: packageInfo.project,
      fileName: packageInfo.fileName,
      version: packageInfo.version,
      fileMD5: packageInfo.fileMD5,
      deployPath: options.deployPath || undefined,
      preservedPaths: options.preservedPaths || [],
      sessionId // 传递会话ID给后端
    }

    console.log('🔧 升级数据:', upgradeData)

    const response = await deviceApi.upgradeDevice(device.deviceId, upgradeData)

    if (response.success) {
      toast.success(`设备 "${device.deviceName}" 升级命令已发送`, '升级启动')
    }

    return {
      sessionId,
      response
    }
  } catch (error) {
    console.error('升级设备失败:', error)
    toast.error(`设备升级失败: ${error.message}`, '升级失败')
    throw error
  }
}

// 批量升级 - 使用真正的批量升级接口
const batchUpgrade = async (deviceList, project, packageInfo, options = {}) => {
  try {
    // 生成会话ID用于批量操作进度追踪
    const sessionId = generateSessionId()
    console.log(`🚀 开始批量升级，会话ID: ${sessionId}，设备数量: ${deviceList.length}`)

    const payload = {
      deviceIds: deviceList.map((device) => device.deviceId),
      packageFileName: packageInfo.fileName,
      project,
      deployPath: options.deployPath || undefined,
      preservedPaths: options.preservedPaths || [],
      sessionId // 传递会话ID给后端
    }

    console.log('🔧 批量升级数据:', payload)

    const response = await batchApi.createBatchUpgrade(payload)

    console.log(`批量升级完成，共 ${deviceList.length} 个设备`)

    // 返回格式与原来保持一致
    const sessions = [
      {
        sessionId,
        deviceIds: deviceList.map((d) => d.deviceId),
        taskId: response.taskId
      }
    ]

    return {
      sessions,
      responses: [response]
    }
  } catch (error) {
    console.error('批量升级失败:', error)
    throw error
  }
}

// 包管理
const packages = ref([])

/** 获取包列表 */
const fetchPackages = async () => {
  try {
    const response = await packageApi.getPackageListForUpgrade()
    packages.value = response.packages || []
  } catch (error) {
    console.error('获取包列表失败:', error)
    toast.error(error.message || '获取包列表失败', '包列表')
    packages.value = []
  }
}

// 本地状态（加载/校验）
const loadingPackages = ref(false)
const upgrading = ref(false)

// 保护文件配置来源控制
const useBackendConfig = ref(true) // 默认使用后端配置

const resolveStoredDeployPath = (project) => {
  if (!project || targetDevices.value.length === 0) return null
  const primary = targetDevices.value[0]
  if (!primary || !primary.deviceId) return null
  const deployPaths = primary?.deploy?.currentDeployPaths || primary?.deployInfo?.deployPaths || {}
  const fallback = project === 'frontend' ? primary?.frontendDeployPath : primary?.backendDeployPath

  const candidates = [deployPaths[project], fallback]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim()
    }
  }
  return null
}

// 获取设备的白名单配置（支持手动切换）
const resolveStoredPreservedPaths = (project) => {
  if (!project) return []

  // 获取后端返回的保护文件配置
  const backendPaths = resolveDevicePreservedPaths(targetDevices.value, project)
  // 获取环境变量配置
  const envPaths = getEnvPreservedPaths(project)

  // 根据用户选择返回对应配置
  if (useBackendConfig.value && backendPaths.length > 0) {
    return backendPaths
  } else if (!useBackendConfig.value && envPaths.length > 0) {
    return envPaths
  }

  // 如果用户选择的配置源没有数据，自动切换到有数据的配置源
  if (backendPaths.length > 0) {
    useBackendConfig.value = true
    return backendPaths
  } else if (envPaths.length > 0) {
    useBackendConfig.value = false
    return envPaths
  }

  return []
}

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

// 常用白名单路径选项
const commonPreservedPaths = [
  { label: '.env - 环境配置文件', value: '.env' },
  { label: 'config/ - 配置目录', value: 'config/' },
  { label: 'logs/ - 日志目录', value: 'logs/' },
  { label: 'storage/ - 存储目录', value: 'storage/' },
  { label: 'data/ - 数据目录', value: 'data/' },
  { label: 'uploads/ - 上传目录', value: 'uploads/' },
  { label: 'public/ - 静态资源', value: 'public/' },
  { label: 'vendor/ - 依赖包', value: 'vendor/' },
  { label: 'node_modules/ - Node依赖', value: 'node_modules/' },
  { label: 'database/ - 数据库文件', value: 'database/' }
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
    .filter((pkg) => pkg.project === formData.value.project)
    .sort((a, b) => {
      // 按上传时间倒序排列，最新的在前
      const timeA = new Date(a.uploadedAt || 0).getTime()
      const timeB = new Date(b.uploadedAt || 0).getTime()
      return timeB - timeA
    })
})

const selectedPackageInfo = computed(() => {
  if (!formData.value?.packageName) return null
  return availablePackages.value.find((pkg) => pkg.id === formData.value.packageName)
})

// 设备状态统计
const deviceStatusSummary = computed(() => {
  const statusCount = {}
  targetDevices.value.forEach((device) => {
    const status = device.status
    statusCount[status] = (statusCount[status] || 0) + 1
  })

  return Object.entries(statusCount).map(([status, count]) => ({
    name: getStatusLabel(status),
    count,
    color: getStatusColor(status)
  }))
})

// 检查是否有后端配置
const hasBackendConfig = computed(() => {
  if (!formData.value?.project) return false
  const backendPaths = resolveDevicePreservedPaths(targetDevices.value, formData.value.project)
  return backendPaths.length > 0
})

// 检查是否有环境变量配置
const hasEnvConfig = computed(() => {
  if (!formData.value?.project) return false
  const envPaths = getEnvPreservedPaths(formData.value.project)
  return envPaths.length > 0
})

// 检查是否有多个配置源可选
const hasMultipleConfigSources = computed(() => {
  return hasBackendConfig.value && hasEnvConfig.value
})

// 保护文件配置来源
const preservedPathsSource = computed(() => {
  if (!formData.value?.project) return '无配置'

  // 如果有切换器，根据用户选择显示
  if (hasMultipleConfigSources.value) {
    return useBackendConfig.value ? '后端配置' : '环境变量'
  }

  // 如果没有切换器，显示实际使用的配置源
  const backendPaths = resolveDevicePreservedPaths(targetDevices.value, formData.value.project)
  return getPreservedPathsSource(formData.value.project, backendPaths)
})

// 监听项目变化，清空包选择并设置默认部署路径和白名单
watch(
  () => formData.value?.project,
  (newProject) => {
    console.log('newProject: ', newProject)
    if (!formData.value) return
    formData.value.packageName = null

    // 重置配置源选择为默认（后端优先）
    useBackendConfig.value = true

    const storedPath = resolveStoredDeployPath(newProject)
    const storedPreservedPaths = resolveStoredPreservedPaths(newProject)

    // 为不同项目设置默认路径和白名单，优先使用已记录的配置
    formData.value.deployPath = storedPath || null
    formData.value.preservedPaths = storedPreservedPaths || []
  }
)

// 监听配置源切换，自动更新保护文件
watch(
  () => useBackendConfig.value,
  () => {
    if (!formData.value?.project) return

    const newPreservedPaths = resolveStoredPreservedPaths(formData.value.project)
    formData.value.preservedPaths = newPreservedPaths || []

    console.log(`切换到${useBackendConfig.value ? '后端' : '环境变量'}配置:`, newPreservedPaths)
  }
)

// 监听目标设备变化，清空包选择并设置默认部署路径和白名单
watch(
  () => targetDevices.value,
  (devices) => {
    if (!devices || devices.length === 0 || !formData.value?.project) {
      return
    }
    formData.value.packageName = null
    const storedPath = resolveStoredDeployPath(formData.value.project)
    const storedPreservedPaths = resolveStoredPreservedPaths(formData.value.project)

    formData.value.deployPath = storedPath || null
    formData.value.preservedPaths = storedPreservedPaths || []
  },
  { deep: true }
)

// 重置表单到初始状态
const resetForm = () => {
  const defaultProject = 'frontend'

  // 重置配置源选择为默认（后端优先）
  useBackendConfig.value = true

  formData.value = {
    project: defaultProject,
    packageName: null,
    deployPath: resolveStoredDeployPath(defaultProject) || null,
    preservedPaths: resolveStoredPreservedPaths(defaultProject) || [],
    options: {
      backup: true,
      rollbackOnFail: true,
      restartAfterUpgrade: false
    }
  }
}

// 监听对话框可见性，加载包列表和重置表单
watch(
  () => open.value,
  async (visible) => {
    if (visible) {
      // 重置表单和状态
      resetForm()
      upgrading.value = false

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
  }
)

// 方法
/** 实际执行升级逻辑 */
const performUpgrade = async () => {
  try {
    upgrading.value = true
    const project = formData.value.project
    const packageInfo = selectedPackageInfo.value
    const options = { ...(formData.value.options || {}) }
    const deployPath = formData.value.deployPath?.trim()
    if (deployPath) {
      options.deployPath = deployPath
    } else {
      delete options.deployPath
    }

    // 添加白名单路径
    const preservedPaths = formData.value.preservedPaths || []
    if (preservedPaths.length > 0) {
      options.preservedPaths = preservedPaths
    }
    const target = targetDevices.value

    let successPayload = null

    // 立即关闭对话框，不等待升级完成
    open.value = false

    if (target.length === 1) {
      const sessionResult = await upgradeDevice(target[0], project, packageInfo, options)
      toast.success(`设备 "${target[0].deviceName}" 升级操作已启动`, '升级开始')

      successPayload = {
        type: 'single',
        operationType: 'upgrade',
        devices: [...target],
        sessions: sessionResult?.sessionId
          ? [
              {
                sessionId: sessionResult.sessionId,
                deviceId: target[0].deviceId,
                deviceName: target[0].deviceName,
                taskId: sessionResult?.response?.taskId || null
              }
            ]
          : []
      }
    } else {
      const { sessions, responses } = await batchUpgrade(target, project, packageInfo, options)
      toast.success(`批量升级操作已启动，共 ${target.length} 个设备`, '批量升级')

      successPayload = {
        type: 'batch',
        operationType: 'upgrade',
        devices: [...target],
        sessions,
        taskId:
          sessions.find((item) => item.taskId)?.taskId ||
          responses?.find((item) => item?.response?.taskId)?.response?.taskId ||
          null
      }
    }

    emit('success', successPayload)
  } catch (error) {
    console.error('升级失败:', error)
    toast.error('升级操作失败', '错误')
    // 错误情况下也需要关闭弹框
    open.value = false
  } finally {
    upgrading.value = false
  }
}

/** 提交升级（与 @ok 绑定） */
const handleSubmit = async () => {
  try {
    await upgradeFormRef.value.validate()
  } catch (error) {
    return console.error('表单校验失败:', error)
  }

  const deviceCount = targetDevices.value.length
  const confirmContent =
    deviceCount > 1
      ? `确定要开始升级这 ${deviceCount} 台设备吗？`
      : `确定要开始升级设备 "${targetDevices.value[0]?.deviceName || '未命名设备'}" 吗？`

  Modal.confirm({
    title: '确认升级',
    content: confirmContent,
    okText: '开始升级',
    cancelText: '取消',
    onOk: () => {
      // 不使用 await，让确认框立即关闭
      performUpgrade().catch((error) => {
        console.error('升级执行失败:', error)
      })
    }
  })
}

/** 取消并关闭弹窗 */
const cancel = () => {
  open.value = false
  upgradeFormRef.value?.resetFields()
}

// 工具方法
const getStatusLabel = (status) => {
  const labels = {
    online: '在线',
    offline: '离线',
    upgrading: '升级中',
    error: '错误'
  }
  return labels[status] || status
}

// 获取状态对应的颜色
const getStatusColor = (status) => {
  const colors = {
    online: 'success',
    offline: 'default',
    upgrading: 'processing',
    error: 'error'
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
