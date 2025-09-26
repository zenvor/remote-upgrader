<template>
  <div class="operation-progress">
    <!-- 进度容器 -->
    <div class="progress-container" :class="{ 'has-error': hasError }">
      <!-- 主标题 -->
      <div class="progress-header">
        <div class="operation-title">
          <component :is="getStatusIcon()" class="status-icon" :class="getStatusIconClass()" />
          <span class="title-text">{{ getOperationTitle() }}</span>
        </div>
        <div v-if="showClose && !isRunning" class="close-button" @click="$emit('close')">
          <CloseOutlined />
        </div>
      </div>

      <!-- 设备信息 -->
      <div v-if="deviceInfo" class="device-info">
        <span class="device-name">{{ deviceInfo.name }}</span>
        <span class="device-id">{{ deviceInfo.id }}</span>
      </div>

      <!-- 主进度条 -->
      <div class="main-progress">
        <a-progress
          :percent="overallProgress"
          :status="getProgressStatus()"
          :stroke-color="getProgressColor()"
          :show-info="false"
          stroke-width="8"
        />
        <div class="progress-info">
          <span class="progress-text">{{ overallProgress }}%</span>
          <span v-if="estimatedTime && isRunning" class="estimated-time">
            预计剩余 {{ formatTime(estimatedTime) }}
          </span>
        </div>
      </div>

      <!-- 步骤指示器 -->
      <div class="steps-container">
        <div
          v-for="step in displaySteps"
          :key="step.key"
          class="step-item"
          :class="getStepClass(step)"
        >
          <div class="step-icon">
            <component
              :is="getStepIcon(step)"
              :class="{ 'spinning': isStepActive(step) && isRunning }"
            />
          </div>
          <div class="step-content">
            <div class="step-title">{{ step.title }}</div>
            <div v-if="isStepActive(step) && currentMessage" class="step-message">
              {{ currentMessage }}
            </div>
          </div>
        </div>
      </div>

      <!-- 错误信息 -->
      <div v-if="hasError" class="error-container">
        <div class="error-header">
          <ExclamationCircleOutlined class="error-icon" />
          <span class="error-title">操作失败</span>
        </div>
        <div class="error-message">{{ errorMessage }}</div>
        <div v-if="showRetry" class="error-actions">
          <a-button type="primary" danger @click="$emit('retry')">
            重试
          </a-button>
        </div>
      </div>

      <!-- 成功信息 -->
      <div v-if="isCompleted && !hasError" class="success-container">
        <div class="success-header">
          <CheckCircleOutlined class="success-icon" />
          <span class="success-title">操作完成</span>
        </div>
        <div class="success-message">
          {{ getSuccessMessage() }}
        </div>
        <div class="success-stats">
          <span>耗时: {{ formatDuration(duration) }}</span>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div v-if="showActions" class="action-buttons">
        <a-space>
          <a-button v-if="isRunning && canCancel" danger @click="$emit('cancel')">
            取消操作
          </a-button>
          <a-button v-if="isCompleted || hasError" @click="$emit('close')">
            关闭
          </a-button>
        </a-space>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import {
  LoadingOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  CloseOutlined,
  CloudDownloadOutlined,
  FolderOpenOutlined,
  DeploymentUnitOutlined,
  SafetyOutlined,
  CheckOutlined,
  DeleteOutlined
} from '@ant-design/icons-vue'
import { PROGRESS_STEPS, calculateOverallProgress } from '@/constants/progress.js'
import { formatDuration } from '@/utils/progressTypes.js'

// Props定义
const props = defineProps({
  // 基础信息
  sessionId: {
    type: String,
    default: ''
  },
  operationType: {
    type: String,
    default: 'upgrade' // 'upgrade' | 'rollback'
  },
  project: {
    type: String,
    default: ''
  },
  version: {
    type: String,
    default: ''
  },

  // 设备信息
  deviceInfo: {
    type: Object,
    default: () => ({
      id: '',
      name: ''
    })
  },

  // 进度状态
  currentStep: {
    type: String,
    default: PROGRESS_STEPS.CONNECTING
  },
  stepProgress: {
    type: Number,
    default: 0
  },
  currentMessage: {
    type: String,
    default: ''
  },

  // 时间信息
  startTime: {
    type: String,
    default: null
  },
  estimatedTime: {
    type: Number,
    default: 0
  },

  // 状态控制
  isRunning: {
    type: Boolean,
    default: false
  },
  isCompleted: {
    type: Boolean,
    default: false
  },
  hasError: {
    type: Boolean,
    default: false
  },
  errorMessage: {
    type: String,
    default: ''
  },

  // 显示控制
  showClose: {
    type: Boolean,
    default: true
  },
  showActions: {
    type: Boolean,
    default: true
  },
  showRetry: {
    type: Boolean,
    default: true
  },
  canCancel: {
    type: Boolean,
    default: true
  }
})

// 事件定义
defineEmits(['close', 'cancel', 'retry'])

// 计算总体进度
const overallProgress = computed(() => {
  if (props.hasError) return 0
  if (props.isCompleted) return 100
  return calculateOverallProgress(props.currentStep, props.stepProgress)
})

// 运行时长
const duration = computed(() => {
  if (!props.startTime) return 0
  const start = new Date(props.startTime).getTime()
  const end = props.isCompleted ? Date.now() : Date.now()
  return end - start
})

// 步骤显示配置
const displaySteps = computed(() => {
  const baseSteps = [
    { key: PROGRESS_STEPS.CONNECTING, title: '连接设备', icon: 'LoadingOutlined' },
    { key: PROGRESS_STEPS.PREPARING, title: '准备环境', icon: 'FolderOpenOutlined' },
    { key: PROGRESS_STEPS.BACKUP, title: '备份当前版本', icon: 'SafetyOutlined' },
    { key: PROGRESS_STEPS.DOWNLOADING, title: '下载升级包', icon: 'CloudDownloadOutlined' },
    { key: PROGRESS_STEPS.EXTRACTING, title: '解压部署包', icon: 'DeploymentUnitOutlined' },
    { key: PROGRESS_STEPS.DEPLOYING, title: '部署新版本', icon: 'DeploymentUnitOutlined' },
    { key: PROGRESS_STEPS.VERIFYING, title: '验证部署结果', icon: 'CheckOutlined' },
    { key: PROGRESS_STEPS.CLEANING, title: '清理临时文件', icon: 'DeleteOutlined' }
  ]

  // 根据操作类型调整步骤
  if (props.operationType === 'rollback') {
    return baseSteps.map(step => {
      if (step.key === PROGRESS_STEPS.DOWNLOADING) {
        return { ...step, title: '准备回滚' }
      }
      if (step.key === PROGRESS_STEPS.DEPLOYING) {
        return { ...step, title: '回滚到旧版本' }
      }
      return step
    })
  }

  return baseSteps
})

// 获取操作标题
const getOperationTitle = () => {
  const typeText = props.operationType === 'rollback' ? '回滚' : '升级'
  const projectText = props.project ? `${props.project}` : ''
  const versionText = props.version ? ` v${props.version}` : ''
  return `${typeText}${projectText}${versionText}`
}

// 获取状态图标
const getStatusIcon = () => {
  if (props.hasError) return ExclamationCircleOutlined
  if (props.isCompleted) return CheckCircleOutlined
  if (props.isRunning) return LoadingOutlined
  return LoadingOutlined
}

const getStatusIconClass = () => {
  if (props.hasError) return 'error-icon'
  if (props.isCompleted) return 'success-icon'
  if (props.isRunning) return 'running-icon spinning'
  return 'waiting-icon'
}

// 获取进度条状态
const getProgressStatus = () => {
  if (props.hasError) return 'exception'
  if (props.isCompleted) return 'success'
  return 'active'
}

const getProgressColor = () => {
  if (props.hasError) return '#ff4d4f'
  if (props.isCompleted) return '#52c41a'
  return '#1890ff'
}

// 步骤状态判断
const isStepActive = (step) => {
  return step.key === props.currentStep && props.isRunning
}

const isStepCompleted = (step) => {
  const stepOrder = displaySteps.value.map(s => s.key)
  const currentIndex = stepOrder.indexOf(props.currentStep)
  const stepIndex = stepOrder.indexOf(step.key)
  return stepIndex < currentIndex || props.isCompleted
}

const isStepError = (step) => {
  return props.hasError && step.key === props.currentStep
}

const getStepClass = (step) => {
  return {
    'step-active': isStepActive(step),
    'step-completed': isStepCompleted(step),
    'step-error': isStepError(step),
    'step-pending': !isStepActive(step) && !isStepCompleted(step) && !isStepError(step)
  }
}

const getStepIcon = (step) => {
  if (isStepCompleted(step)) return CheckCircleOutlined
  if (isStepError(step)) return ExclamationCircleOutlined
  if (isStepActive(step)) return LoadingOutlined

  // 根据步骤类型返回对应图标
  switch (step.icon) {
    case 'CloudDownloadOutlined': return CloudDownloadOutlined
    case 'FolderOpenOutlined': return FolderOpenOutlined
    case 'DeploymentUnitOutlined': return DeploymentUnitOutlined
    case 'SafetyOutlined': return SafetyOutlined
    case 'CheckOutlined': return CheckOutlined
    case 'DeleteOutlined': return DeleteOutlined
    default: return LoadingOutlined
  }
}

// 格式化时间
const formatTime = (milliseconds) => {
  if (!milliseconds || milliseconds <= 0) return '0秒'

  const seconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(seconds / 60)

  if (minutes > 0) {
    return `${minutes}分${seconds % 60}秒`
  }
  return `${seconds}秒`
}

// 获取成功消息
const getSuccessMessage = () => {
  const typeText = props.operationType === 'rollback' ? '回滚' : '升级'
  return `${typeText}操作已成功完成！`
}
</script>

<style scoped lang="less">
.operation-progress {
  .progress-container {
    background: #fff;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    border: 1px solid #f0f0f0;

    &.has-error {
      border-color: #ff7875;
      background: #fff2f0;
    }
  }

  .progress-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;

    .operation-title {
      display: flex;
      align-items: center;
      gap: 8px;

      .status-icon {
        font-size: 18px;

        &.error-icon {
          color: #ff4d4f;
        }

        &.success-icon {
          color: #52c41a;
        }

        &.running-icon {
          color: #1890ff;
        }

        &.waiting-icon {
          color: #8c8c8c;
        }

        &.spinning {
          animation: spin 1s linear infinite;
        }
      }

      .title-text {
        font-size: 18px;
        font-weight: 600;
        color: #262626;
      }
    }

    .close-button {
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      color: #8c8c8c;

      &:hover {
        background: #f5f5f5;
        color: #595959;
      }
    }
  }

  .device-info {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
    font-size: 14px;

    .device-name {
      color: #262626;
      font-weight: 500;
    }

    .device-id {
      color: #8c8c8c;
      font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace;
    }
  }

  .main-progress {
    margin-bottom: 24px;

    .progress-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 8px;
      font-size: 14px;

      .progress-text {
        font-weight: 600;
        color: #262626;
      }

      .estimated-time {
        color: #8c8c8c;
      }
    }
  }

  .steps-container {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 20px;
  }

  .step-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px;
    border-radius: 8px;
    transition: all 0.3s ease;

    &.step-active {
      background: #e6f7ff;
      border: 1px solid #91d5ff;
    }

    &.step-completed {
      background: #f6ffed;
      border: 1px solid #b7eb8f;
    }

    &.step-error {
      background: #fff2f0;
      border: 1px solid #ffccc7;
    }

    &.step-pending {
      background: #fafafa;
      border: 1px solid #f0f0f0;
    }

    .step-icon {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 2px;

      .anticon {
        font-size: 16px;

        &.spinning {
          animation: spin 1s linear infinite;
        }
      }
    }

    .step-content {
      flex: 1;
      min-width: 0;

      .step-title {
        font-weight: 500;
        color: #262626;
        margin-bottom: 4px;
      }

      .step-message {
        font-size: 13px;
        color: #8c8c8c;
        line-height: 1.4;
      }
    }
  }

  .error-container {
    background: #fff2f0;
    border: 1px solid #ffccc7;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;

    .error-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;

      .error-icon {
        color: #ff4d4f;
        font-size: 16px;
      }

      .error-title {
        font-weight: 600;
        color: #cf1322;
      }
    }

    .error-message {
      color: #cf1322;
      margin-bottom: 12px;
      line-height: 1.5;
    }

    .error-actions {
      display: flex;
      justify-content: flex-end;
    }
  }

  .success-container {
    background: #f6ffed;
    border: 1px solid #b7eb8f;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;

    .success-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;

      .success-icon {
        color: #52c41a;
        font-size: 16px;
      }

      .success-title {
        font-weight: 600;
        color: #389e0d;
      }
    }

    .success-message {
      color: #389e0d;
      margin-bottom: 8px;
    }

    .success-stats {
      font-size: 12px;
      color: #52c41a;
    }
  }

  .action-buttons {
    display: flex;
    justify-content: flex-end;
    padding-top: 16px;
    border-top: 1px solid #f0f0f0;
  }
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>