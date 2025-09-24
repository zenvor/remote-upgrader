<template>
  <a-modal
    v-model:open="open"
    :title="modalTitle"
    width="700px"
    :confirm-loading="loading"
    ok-text="确定"
    cancel-text="取消"
    @ok="handleConfirm"
    @cancel="handleCancel"
  >
    <!-- 设备选择区域 -->
    <div class="section">
      <h4>选中的设备 ({{ selectedDevices.length }})</h4>
      <div class="device-list">
        <a-tag v-for="device in selectedDevices" :key="device.deviceId">
          {{ device.deviceId }}
        </a-tag>
        <span v-if="selectedDevices.length === 0" class="no-device"> 请先在设备列表中选择要操作的设备 </span>
      </div>
    </div>

    <!-- 升级配置 -->
    <div v-if="operationType === 'upgrade'" class="section">
      <h4>升级配置</h4>
      <a-form ref="upgradeFormRef" :model="upgradeForm" layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item
              label="项目类型"
              name="project"
              :rules="[{ required: true, message: '请选择项目类型', trigger: 'change' }]"
            >
              <a-select
                v-model:value="upgradeForm.project"
                placeholder="选择项目类型"
                allow-clear
                @change="fetchPackages"
              >
                <a-select-option value="frontend">前端项目</a-select-option>
                <a-select-option value="backend">后端项目</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item
              label="升级包"
              name="packageFileName"
              :rules="[{ required: true, message: '请选择升级包', trigger: 'change' }]"
            >
              <a-select
                v-model:value="upgradeForm.packageFileName"
                placeholder="选择升级包"
                allow-clear
                :loading="packagesLoading"
              >
                <a-select-option v-for="pkg in packages" :key="pkg.fileName" :value="pkg.fileName">
                  {{ pkg.fileName }} ({{ pkg.version }})
                </a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </div>

    <!-- 回滚配置 -->
    <div v-if="operationType === 'rollback'" class="section">
      <h4>回滚配置</h4>
      <a-form ref="rollbackFormRef" :model="rollbackForm" layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item
              label="项目类型"
              name="project"
              :rules="[{ required: true, message: '请选择项目类型', trigger: 'change' }]"
            >
              <a-select v-model:value="rollbackForm.project" placeholder="选择项目类型">
                <a-select-option value="frontend">前端项目</a-select-option>
                <a-select-option value="backend">后端项目</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="说明">
              <a-typography-text type="secondary">
                将回滚到上一个版本
              </a-typography-text>
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </div>
  </a-modal>
</template>

<script setup>
import { batchApi, packageApi } from '@/api'
import { message } from 'ant-design-vue'
import { computed, ref, watch } from 'vue'

// Props 和双向绑定
const open = defineModel('open', { type: Boolean, default: false })

const props = defineProps({
  operationType: {
    type: String,
    default: 'upgrade' // 'upgrade' 或 'rollback'
  },
  devices: {
    type: Array,
    default: () => [] // 选中的设备列表
  }
})

const emit = defineEmits(['success'])

const selectedDevices = ref([...props.devices])
const loading = ref(false)
const packages = ref([])
const packagesLoading = ref(false)

// 创建初始化表单数据
const createInitialUpgradeFormData = () => ({ project: null, packageFileName: null })

// 升级表单数据
const upgradeForm = ref(createInitialUpgradeFormData())

// 创建初始化表单数据
const createInitialRollbackFormData = () => ({ project: null })

// 回滚表单数据
const rollbackForm = ref(createInitialRollbackFormData())

// 升级表单引用
const upgradeFormRef = ref(null)

// 回滚表单引用
const rollbackFormRef = ref(null)

// 重置升级表单数据
const resetUpgradeForm = () => {
  upgradeFormRef.value.resetFields()
  upgradeForm.value = createInitialUpgradeFormData()
}

// 重置回滚表单数据
const resetRollbackForm = () => {
  rollbackFormRef.value.resetFields()
  rollbackForm.value = createInitialRollbackFormData()
}

// 计算属性
const modalTitle = computed(() => {
  return props.operationType === 'upgrade' ? '批量升级' : '批量回滚'
})

// 监听设备变化
watch(
  () => props.devices,
  (newDevices) => {
    selectedDevices.value = [...newDevices]
  },
  { deep: true }
)

// 方法
const fetchPackages = async () => {
  if (!upgradeForm.value.project) return

  packagesLoading.value = true
  try {
    const response = await packageApi.getPackageList({ project: upgradeForm.value.project })
    packages.value = response.packages || []
  } catch (error) {
    console.error('获取包列表失败:', error)
    message.error('获取包列表失败')
  } finally {
    packagesLoading.value = false
  }
}

const handleConfirm = async () => {
  loading.value = true
  try {
    const deviceIds = selectedDevices.value.map((device) => device.deviceId)
    let response

    if (props.operationType === 'upgrade') {
      const validate = await upgradeFormRef.value.validate()
      if (!validate) return
      response = await batchApi.createBatchUpgrade({
        deviceIds,
        ...upgradeForm.value
      })
    } else {
      const validate = await rollbackFormRef.value.validate()
      if (!validate) return
      response = await batchApi.createBatchRollback({
        deviceIds,
        ...rollbackForm.value
      })
    }

    const operationText = props.operationType === 'upgrade' ? '升级' : '回滚'
    message.success(`批量${operationText}任务创建成功，任务ID: ${response.taskId}`)
    emit('success', response)
    handleCancel()
  } catch (error) {
    console.error('批量操作失败:', error)
  } finally {
    loading.value = false
  }
}

const handleCancel = () => {
  open.value = false
  // 重置表单
  if (props.operationType === 'upgrade') {
    resetUpgradeForm()
  } else {
    resetRollbackForm()
  }
}
</script>

<style scoped>
.section {
  margin-bottom: 20px;
}

.section h4 {
  margin: 0 0 12px 0;
  font-weight: 600;
  color: #333;
}

.device-list {
  min-height: 40px;
  padding: 8px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  background: #fafafa;
}

.device-list .ant-tag {
  margin: 2px;
}

.no-device {
  color: #999;
  font-style: italic;
}
</style>
