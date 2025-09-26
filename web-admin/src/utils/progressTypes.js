/**
 * 进度相关数据类型和工具函数
 */
import { PROGRESS_STEPS, OPERATION_TYPES, OPERATION_STATUS, PROGRESS_STATUS } from '@/constants/progress.js'

/**
 * 创建进度会话对象
 * @param {Object} options - 配置选项
 * @returns {Object} 进度会话对象
 */
export function createProgressSession(options = {}) {
  const {
    sessionId,
    deviceId,
    deviceName,
    operationType,
    project,
    version,
    packageInfo
  } = options

  return {
    // 会话标识
    sessionId: sessionId || generateSessionId(),
    deviceId: deviceId || '',
    deviceName: deviceName || '',

    // 操作信息
    operationType: operationType || OPERATION_TYPES.UPGRADE,
    project: project || '',
    version: version || '',
    packageInfo: packageInfo || null,

    // 进度状态
    status: PROGRESS_STATUS.WAITING,
    currentStep: PROGRESS_STEPS.CONNECTING,
    stepProgress: 0,
    overallProgress: 0,
    message: '',
    error: null,

    // 时间信息
    startTime: null,
    endTime: null,
    duration: 0,

    // 步骤详情
    stepDetails: new Map(),

    // 元数据
    metadata: {}
  }
}

/**
 * 创建进度更新事件
 * @param {Object} options - 更新选项
 * @returns {Object} 进度更新事件对象
 */
export function createProgressUpdate(options = {}) {
  const {
    sessionId,
    deviceId,
    step,
    progress,
    message,
    error,
    metadata
  } = options

  return {
    sessionId: sessionId || '',
    deviceId: deviceId || '',
    step: step || PROGRESS_STEPS.CONNECTING,
    progress: Math.min(100, Math.max(0, progress || 0)),
    message: message || '',
    error: error || null,
    timestamp: new Date().toISOString(),
    metadata: metadata || {}
  }
}

/**
 * 创建批量操作进度状态
 * @param {Object} options - 配置选项
 * @returns {Object} 批量进度对象
 */
export function createBatchProgress(options = {}) {
  const {
    batchId,
    operationType,
    deviceSessions
  } = options

  return {
    batchId: batchId || generateSessionId(),
    operationType: operationType || OPERATION_TYPES.BATCH_UPGRADE,

    // 整体状态
    status: OPERATION_STATUS.PENDING,
    startTime: null,
    endTime: null,

    // 设备会话
    deviceSessions: deviceSessions || new Map(),

    // 统计信息
    stats: {
      total: 0,
      pending: 0,
      running: 0,
      success: 0,
      failed: 0,
      cancelled: 0
    }
  }
}

/**
 * 生成唯一的会话ID
 * @returns {string} 会话ID
 */
export function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 验证进度数据格式
 * @param {Object} progressData - 进度数据
 * @returns {boolean} 是否有效
 */
export function validateProgressData(progressData) {
  if (!progressData || typeof progressData !== 'object') {
    return false
  }

  const required = ['sessionId', 'deviceId', 'step']
  for (const field of required) {
    if (!progressData[field]) {
      return false
    }
  }

  // 验证步骤是否有效
  if (!Object.values(PROGRESS_STEPS).includes(progressData.step)) {
    return false
  }

  // 验证进度范围
  if (progressData.progress !== undefined) {
    const progress = Number(progressData.progress)
    if (isNaN(progress) || progress < 0 || progress > 100) {
      return false
    }
  }

  return true
}

/**
 * 格式化持续时间
 * @param {number} duration - 持续时间（毫秒）
 * @returns {string} 格式化的时间字符串
 */
export function formatDuration(duration) {
  if (!duration || duration < 0) return '0秒'

  const seconds = Math.floor(duration / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}小时${minutes % 60}分${seconds % 60}秒`
  } else if (minutes > 0) {
    return `${minutes}分${seconds % 60}秒`
  } else {
    return `${seconds}秒`
  }
}

/**
 * 计算操作预估时间
 * @param {string} operationType - 操作类型
 * @param {string} currentStep - 当前步骤
 * @returns {number} 预估剩余时间（毫秒）
 */
export function estimateRemainingTime(operationType, currentStep) {
  // 基于历史数据的预估时间（毫秒）
  const stepEstimates = {
    [PROGRESS_STEPS.CONNECTING]: 5000,
    [PROGRESS_STEPS.PREPARING]: 10000,
    [PROGRESS_STEPS.BACKUP]: 30000,
    [PROGRESS_STEPS.DOWNLOADING]: 60000,
    [PROGRESS_STEPS.EXTRACTING]: 20000,
    [PROGRESS_STEPS.DEPLOYING]: 40000,
    [PROGRESS_STEPS.VERIFYING]: 15000,
    [PROGRESS_STEPS.CLEANING]: 5000
  }

  const currentIndex = Object.keys(stepEstimates).indexOf(currentStep)
  if (currentIndex === -1) return 0

  // 计算剩余步骤的总预估时间
  const remainingSteps = Object.keys(stepEstimates).slice(currentIndex + 1)
  let totalEstimate = 0

  remainingSteps.forEach(step => {
    totalEstimate += stepEstimates[step]
  })

  // 根据操作类型调整预估时间
  if (operationType === OPERATION_TYPES.ROLLBACK) {
    totalEstimate *= 0.7 // 回滚通常更快
  }

  return totalEstimate
}