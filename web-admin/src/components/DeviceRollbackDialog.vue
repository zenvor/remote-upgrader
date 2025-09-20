<template>
  <a-modal
    v-model:open="open"
    :title="dialogTitle"
    :width="700"
    :maskClosable="false"
    @cancel="cancel"
    destroy-on-close
    ok-text="开始回滚"
    cancel-text="取消"
    @ok="handleSubmit"
    :confirm-loading="rolling"
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
          <a-statistic :value="targetDevices.length" suffix="台设备" title="批量回滚" />
          <div style="margin-top: 12px">
            <a-space>
              <a-tag v-for="status in deviceStatusSummary" :key="status.name" :color="status.color">
                {{ status.name }}: {{ status.count }}
              </a-tag>
            </a-space>
          </div>
        </template>
      </a-card>

      <!-- 回滚配置 -->
      <a-card title="回滚配置" size="small" :bordered="false" class="info-card">
        <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 18 }">
          <a-form-item label="项目类型" :required="true">
            <a-radio-group v-model:value="formData.project">
              <a-radio-button v-for="project in projectOptions" :key="project.value" :value="project.value">
                <component :is="project.icon" style="margin-right: 4px" />
                {{ project.label }}
              </a-radio-button>
            </a-radio-group>
          </a-form-item>
          <a-form-item label="回滚说明">
            <div style="color: #666; font-size: 13px; line-height: 20px">
              系统会使用 <code>agent-device/backup</code> 中的备份，将{{
                getProjectLabel(formData.project)
              }}恢复到上一个版本，不支持选择具体版本或多级回滚。
            </div>
          </a-form-item>
        </a-form>
      </a-card>

      <!-- 回滚警告 -->
      <a-card v-if="formData.project" title="重要提醒" size="small" :bordered="false" class="info-card">
        <a-alert type="warning" message="回滚操作提醒" show-icon>
          <template #description>
            <div>
              <p>• 回滚操作将恢复{{ getProjectLabel(formData.project) }}到之前的版本</p>
              <p>• 请确认设备的 <code>agent-device/backup</code> 目录中存在上一版本备份</p>
              <p>• 回滚过程中服务可能会短暂中断</p>
              <p>• 建议在业务低峰期进行回滚操作</p>
            </div>
          </template>
        </a-alert>
      </a-card>
    </div>
  </a-modal>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useDevices } from '@/composables/useDevices'
import toast from '@/utils/toast'
import { CloudOutlined, HddOutlined } from '@ant-design/icons-vue'

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
  // 仅需指定目标项目
  project: 'frontend'
})

// 回滚 API（由对话框内部直接提交）
const { rollbackDevice, batchRollback } = useDevices()

// 本地状态
const rolling = ref(false)

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
  if (deviceCount === 0) return '设备回滚'
  if (deviceCount === 1) return `回滚设备 - ${targetDevices.value[0].deviceName}`
  return `批量回滚 - ${deviceCount} 个设备`
})

const canRollback = computed(() => {
  return Boolean(formData.value?.project) && targetDevices.value.length > 0 && !rolling.value
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

// 重置表单到初始状态
const resetForm = () => {
  formData.value = {
    project: 'frontend'
  }
}

// 监听对话框可见性，重置表单
watch(
  () => open.value,
  async (visible) => {
    if (visible) {
      // 重置表单和状态
      resetForm()
      rolling.value = false
    }
  }
)

// 监听回滚类型变化，清空目标版本
/** 提交回滚（与 @ok 绑定） */
const handleSubmit = async () => {
  if (!canRollback.value) return

  rolling.value = true
  try {
    const project = formData.value.project
    const target = targetDevices.value

    if (target.length === 1) {
      await rollbackDevice(target[0], project)
      toast.success(`设备 "${target[0].deviceName}" 回滚至上一版本的操作已启动`, '回滚开始')
    } else {
      await batchRollback(target, project)
      toast.success(`批量回滚操作已启动，共 ${target.length} 个设备`, '批量回滚')
    }

    emit('success')
    // 关闭对话框
    open.value = false
  } catch (error) {
    console.error('回滚失败:', error)
    toast.error('回滚操作失败', '错误')
  } finally {
    rolling.value = false
  }
}

/** 取消并关闭弹窗 */
const cancel = () => {
  open.value = false
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

// 获取状态对应的颜色
const getStatusColor = (status) => {
  const colors = {
    online: 'success',
    offline: 'default',
    upgrading: 'processing',
    error: 'error',
    rollback_success: 'success',
    rollback_failed: 'error'
  }
  return colors[status] || 'default'
}

const getProjectLabel = (project) => {
  const labels = {
    frontend: '前端项目',
    backend: '后端项目'
  }
  return labels[project] || project
}
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
</style>
