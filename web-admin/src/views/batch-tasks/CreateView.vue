<template>
  <div class="page-container">
    <!-- 页面标题和操作栏 -->
    <a-card :bordered="false" size="small" class="info-card" :body-style="{ padding: '16px 20px' }">
      <div class="page-header">
        <div class="page-title">
          <h2>批量操作</h2>
          <p>选择设备和升级包，执行批量升级或回滚操作</p>
        </div>
        <div class="page-actions">
          <a-button @click="resetForm">
            <ClearOutlined />
            重置
          </a-button>
        </div>
      </div>
    </a-card>

    <!-- 操作步骤 -->
    <a-card :bordered="false" size="small" class="info-card">
      <a-steps :current="currentStep" size="small">
        <a-step title="选择设备" description="选择要操作的目标设备" />
        <a-step title="选择操作" description="选择升级包或回滚版本" />
        <a-step title="确认执行" description="确认操作并提交任务" />
      </a-steps>
    </a-card>

    <!-- 第一步：设备选择 -->
    <a-card
      v-if="currentStep === 0"
      :bordered="false"
      :body-style="{ padding: '0 20px' }"
      size="small"
      class="info-card"
    >
      <OperationBar :selected-count="selectedDevices.length" title="选择目标设备" @refresh="fetchDevices">
        <template #actions>
          <a-form ref="queryFormRef" layout="inline" :model="queryParams">
            <a-form-item name="search">
              <a-input-search
                v-model:value="queryParams.search"
                placeholder="搜索设备名称或ID"
                style="width: 200px"
                allow-clear
                @search="filterDevices"
              />
            </a-form-item>
            <a-form-item name="status">
              <a-select
                v-model:value="queryParams.status"
                placeholder="设备状态"
                style="width: 200px"
                allow-clear
                @change="filterDevices"
              >
                <a-select-option value="online">在线</a-select-option>
                <a-select-option value="offline">离线</a-select-option>
              </a-select>
            </a-form-item>
          </a-form>
        </template>
      </OperationBar>

      <!-- 设备筛选 -->
      <div class="device-filters"></div>

      <!-- 设备列表 -->
      <div class="device-list">
        <a-table
          :columns="deviceColumns"
          :data-source="devices"
          :pagination="devicePagination"
          :loading="devicesLoading"
          :scroll="{ y: 400 }"
          size="small"
          :row-selection="deviceRowSelection"
          row-key="deviceId"
          @change="handleTableChange"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'status'">
              <a-tag :color="record.status === 'online' ? 'green' : 'red'">
                {{ record.status === 'online' ? '在线' : '离线' }}
              </a-tag>
            </template>
            <template v-if="column.key === 'versions'">
              <div class="version-info">
                <div v-if="record.frontendVersion">前端: {{ record.frontendVersion }}</div>
                <div v-if="record.backendVersion">后端: {{ record.backendVersion }}</div>
              </div>
            </template>
          </template>
        </a-table>
      </div>

      <div class="step-actions">
        <a-button type="primary" :disabled="selectedDevices.length === 0" @click="nextStep">
          下一步：选择操作
        </a-button>
      </div>
    </a-card>

    <!-- 第二步：操作选择 -->
    <a-card v-if="currentStep === 1" :bordered="false" size="small" class="info-card" title="选择操作类型">
      <!-- 操作类型选择 -->
      <a-radio-group v-model:value="operationType" @change="onOperationTypeChange">
        <a-radio value="upgrade">批量升级</a-radio>
        <a-radio value="rollback">批量回滚</a-radio>
      </a-radio-group>

      <!-- 升级操作配置 -->
      <div v-if="operationType === 'upgrade'" class="operation-config">
        <h4>升级配置</h4>

        <a-form :model="upgradeForm" layout="vertical">
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="项目类型" required>
                <a-select v-model:value="upgradeForm.project" placeholder="选择项目类型" @change="onProjectChange">
                  <a-select-option value="frontend">前端</a-select-option>
                  <a-select-option value="backend">后端</a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="升级包" required>
                <a-select
                  v-model:value="upgradeForm.packageFileName"
                  placeholder="选择升级包"
                  :loading="packagesLoading"
                  :disabled="!upgradeForm.project"
                >
                  <a-select-option v-for="pkg in availablePackages" :key="pkg.fileName" :value="pkg.fileName">
                    {{ pkg.fileName }} ({{ pkg.version || '未知版本' }})
                  </a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
          </a-row>
        </a-form>
      </div>

      <!-- 回滚操作配置 -->
      <div v-if="operationType === 'rollback'" class="operation-config">
        <h4>回滚配置</h4>

        <a-form :model="rollbackForm" layout="vertical">
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="项目类型" required>
                <a-select v-model:value="rollbackForm.project" placeholder="选择项目类型">
                  <a-select-option value="frontend">前端</a-select-option>
                  <a-select-option value="backend">后端</a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="说明">
                <a-typography-text type="secondary"> 将回滚到上一个版本 </a-typography-text>
              </a-form-item>
            </a-col>
          </a-row>
        </a-form>
      </div>

      <div class="step-actions">
        <a-space>
          <a-button @click="prevStep"> 上一步 </a-button>
          <a-button type="primary" :disabled="!isOperationConfigValid" @click="nextStep"> 下一步：确认执行 </a-button>
        </a-space>
      </div>
    </a-card>

    <!-- 第三步：确认执行 -->
    <a-card v-if="currentStep === 2" :bordered="false" size="small" class="info-card" title="确认操作信息">
      <!-- 操作摘要 -->
      <div class="operation-summary">
        <a-descriptions :column="2" bordered size="small">
          <a-descriptions-item label="操作类型">
            <a-tag :color="operationType === 'upgrade' ? 'blue' : 'orange'">
              {{ operationType === 'upgrade' ? '批量升级' : '批量回滚' }}
            </a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="目标设备数"> {{ selectedDevices.length }} 台 </a-descriptions-item>
          <a-descriptions-item label="项目类型">
            {{ getProjectLabel(getCurrentForm().project) }}
          </a-descriptions-item>
          <a-descriptions-item v-if="operationType === 'upgrade'" label="升级包">
            {{ upgradeForm.packageFileName }}
          </a-descriptions-item>
          <a-descriptions-item v-if="operationType === 'rollback'" label="目标版本"> 上一版本 </a-descriptions-item>
        </a-descriptions>
      </div>

      <!-- 设备列表预览 -->
      <div class="selected-devices-preview">
        <h4>目标设备列表</h4>
        <a-table
          :columns="selectedDeviceColumns"
          :data-source="selectedDevicesList"
          :pagination="false"
          size="small"
          :scroll="{ y: 200 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'status'">
              <a-tag :color="record.status === 'online' ? 'green' : 'red'">
                {{ record.status === 'online' ? '在线' : '离线' }}
              </a-tag>
            </template>
            <template v-if="column.key === 'currentVersion'">
              {{ getCurrentVersion(record) }}
            </template>
          </template>
        </a-table>
      </div>

      <!-- 风险提示 -->
      <a-alert type="warning" show-icon :message="getRiskMessage()" style="margin-top: 16px" />

      <div class="step-actions">
        <a-space>
          <a-button @click="prevStep"> 上一步 </a-button>
          <a-button type="primary" danger :loading="submitting" @click="confirmSubmit"> 确认执行 </a-button>
        </a-space>
      </div>
    </a-card>
  </div>
</template>

<script setup>
import { batchApi, deviceApi, packageApi } from '@/api'
import OperationBar from '@/components/OperationBar.vue'
import { ClearOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

// 数据状态
const devices = ref([])
const packages = ref([])
const devicesLoading = ref(false)
const packagesLoading = ref(false)

// 响应式数据
const currentStep = ref(0)
const operationType = ref('upgrade')
const selectedDevices = ref([])
const submitting = ref(false)

// 表单引用
const queryFormRef = ref(null)

// 设备查询参数
const queryParams = reactive({
  search: null,
  status: null
})

// 升级表单
const upgradeForm = reactive({
  project: null,
  packageFileName: null
})

// 回滚表单
const rollbackForm = reactive({
  project: null
})

// 设备列表配置
const deviceColumns = [
  {
    title: '设备名称',
    dataIndex: 'deviceName',
    key: 'deviceName',
    width: 150
  },
  {
    title: '设备ID',
    dataIndex: 'deviceId',
    key: 'deviceId',
    width: 120
  },
  {
    title: '状态',
    key: 'status',
    width: 80
  },
  {
    title: '当前版本',
    key: 'versions',
    width: 150
  },
  {
    title: '最后活动',
    dataIndex: 'lastHeartbeat',
    key: 'lastHeartbeat',
    width: 120
  }
]

const selectedDeviceColumns = [
  {
    title: '设备名称',
    dataIndex: 'deviceName',
    key: 'deviceName'
  },
  {
    title: '设备ID',
    dataIndex: 'deviceId',
    key: 'deviceId'
  },
  {
    title: '状态',
    key: 'status'
  },
  {
    title: '当前版本',
    key: 'currentVersion'
  }
]

// 设备分页配置
const devicePagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  showTotal: (total) => `共 ${total} 台设备`
})

// 设备行选择配置
const deviceRowSelection = {
  selectedRowKeys: computed(() => selectedDevices.value),
  onChange: (selectedRowKeys) => {
    selectedDevices.value = selectedRowKeys
  },
  getCheckboxProps: (record) => ({
    disabled: record.status !== 'online' // 离线设备不可选
  })
}

// 计算属性

const availablePackages = computed(() => {
  if (!upgradeForm.project || !packages.value) return []
  return packages.value.filter((pkg) => pkg.project === upgradeForm.project)
})

const selectedDevicesList = computed(() => {
  return devices.value?.filter((device) => selectedDevices.value.includes(device.deviceId)) || []
})

const isOperationConfigValid = computed(() => {
  if (operationType.value === 'upgrade') {
    return upgradeForm.project && upgradeForm.packageFileName
  } else {
    return rollbackForm.project
  }
})

// 方法
function resetForm() {
  currentStep.value = 0
  selectedDevices.value = []
  operationType.value = 'upgrade'
  Object.assign(upgradeForm, { project: '', packageFileName: '' })
  Object.assign(rollbackForm, { project: '' })
  fetchDevices()
}

function nextStep() {
  if (currentStep.value < 2) {
    currentStep.value++
  }
}

function prevStep() {
  if (currentStep.value > 0) {
    currentStep.value--
  }
}

function filterDevices() {
  devicePagination.current = 1
  fetchDevices()
}

function handleTableChange(pagination) {
  devicePagination.current = pagination.current
  devicePagination.pageSize = pagination.pageSize
  fetchDevices()
}

function onOperationTypeChange() {
  // 重置表单
  Object.assign(upgradeForm, { project: '', packageFileName: '' })
  Object.assign(rollbackForm, { project: '' })
}

async function onProjectChange() {
  upgradeForm.packageFileName = ''
  if (upgradeForm.project) {
    await fetchPackages({ project: upgradeForm.project })
  }
}

function getCurrentForm() {
  return operationType.value === 'upgrade' ? upgradeForm : rollbackForm
}

function getProjectLabel(project) {
  if (project === 'frontend') return '前端'
  if (project === 'backend') return '后端'
  return '-'
}

function getCurrentVersion(device) {
  const form = getCurrentForm()
  if (form.project === 'frontend') {
    return device.frontendVersion || '未知'
  } else {
    return device.backendVersion || '未知'
  }
}

function getRiskMessage() {
  const deviceCount = selectedDevices.value.length
  const operationText = operationType.value === 'upgrade' ? '升级' : '回滚'

  return `您即将对 ${deviceCount} 台设备执行批量${operationText}操作。此操作不可撤销，请确保已经做好备份。建议先在少量设备上测试。`
}

async function confirmSubmit() {
  submitting.value = true

  try {
    const form = getCurrentForm()
    let result

    if (operationType.value === 'upgrade') {
      result = await batchApi.createBatchUpgrade({
        deviceIds: selectedDevices.value,
        packageFileName: form.packageFileName,
        project: form.project
      })
    } else {
      result = await batchApi.createBatchRollback({
        deviceIds: selectedDevices.value,
        project: form.project
      })
    }

    if (result.success) {
      message.success(`批量${operationType.value === 'upgrade' ? '升级' : '回滚'}任务已创建`)

      // 跳转到任务监控页面
      router.push({
        path: '/batch-tasks',
        query: { taskId: result.taskId }
      })
    } else {
      message.error(result.error || '创建任务失败')
    }
  } catch (error) {
    console.error('提交批量任务失败:', error)
    message.error('提交失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

// 获取设备列表
async function fetchDevices() {
  devicesLoading.value = true
  try {
    const response = await deviceApi.getDeviceList({
      ...queryParams,
      pageNum: devicePagination.current,
      pageSize: devicePagination.pageSize
    })
    devices.value = response?.devices || []
    devicePagination.total = response?.total || 0
  } catch (error) {
    console.error('获取设备列表失败:', error)
    message.error('获取设备列表失败')
  } finally {
    devicesLoading.value = false
  }
}

// 获取包列表
async function fetchPackages(params = {}) {
  packagesLoading.value = true
  try {
    const response = await packageApi.getPackageList(params)
    packages.value = response?.packages || []
  } catch (error) {
    console.error('获取包列表失败:', error)
    message.error('获取包列表失败')
  } finally {
    packagesLoading.value = false
  }
}

// 生命周期
onMounted(async () => {
  await fetchDevices()
  await fetchPackages()
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

.device-filters {
  margin-bottom: 16px;
}

.operation-config {
  margin-top: 16px;
  padding: 16px;
  background-color: #fafafa;
  border-radius: 6px;
}

.operation-config h4 {
  margin: 0 0 16px 0;
  font-weight: 600;
}

.operation-summary {
  margin-bottom: 16px;
}

.selected-devices-preview {
  margin-bottom: 16px;
}

.selected-devices-preview h4 {
  margin: 0 0 8px 0;
  font-weight: 600;
}

.version-info {
  font-size: 12px;
  line-height: 1.4;
}

.step-actions {
  text-align: right;
  border-top: 1px solid #f0f0f0;
  padding: 20px 0;
}

.ant-steps {
  margin-bottom: 0;
}
</style>
