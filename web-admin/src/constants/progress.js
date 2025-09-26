/**
 * 进度相关常量定义
 */

// 操作步骤枚举
export const PROGRESS_STEPS = {
  CONNECTING: 'connecting',
  PREPARING: 'preparing',
  BACKUP: 'backup',
  DOWNLOADING: 'downloading',
  EXTRACTING: 'extracting',
  DEPLOYING: 'deploying',
  VERIFYING: 'verifying',
  CLEANING: 'cleaning',
  COMPLETED: 'completed',
  FAILED: 'failed'
}

// 步骤显示名称映射
export const STEP_LABELS = {
  [PROGRESS_STEPS.CONNECTING]: '连接设备',
  [PROGRESS_STEPS.PREPARING]: '准备环境',
  [PROGRESS_STEPS.BACKUP]: '备份当前版本',
  [PROGRESS_STEPS.DOWNLOADING]: '下载升级包',
  [PROGRESS_STEPS.EXTRACTING]: '解压升级包',
  [PROGRESS_STEPS.DEPLOYING]: '部署新版本',
  [PROGRESS_STEPS.VERIFYING]: '验证部署结果',
  [PROGRESS_STEPS.CLEANING]: '清理临时文件',
  [PROGRESS_STEPS.COMPLETED]: '操作完成',
  [PROGRESS_STEPS.FAILED]: '操作失败'
}

// 步骤顺序定义（用于计算整体进度）
export const STEP_ORDER = [
  PROGRESS_STEPS.CONNECTING,
  PROGRESS_STEPS.PREPARING,
  PROGRESS_STEPS.BACKUP,
  PROGRESS_STEPS.DOWNLOADING,
  PROGRESS_STEPS.EXTRACTING,
  PROGRESS_STEPS.DEPLOYING,
  PROGRESS_STEPS.VERIFYING,
  PROGRESS_STEPS.CLEANING,
  PROGRESS_STEPS.COMPLETED
]

// 操作类型
export const OPERATION_TYPES = {
  UPGRADE: 'upgrade',
  ROLLBACK: 'rollback',
  BATCH_UPGRADE: 'batch_upgrade',
  BATCH_ROLLBACK: 'batch_rollback'
}

// 操作状态
export const OPERATION_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  SUCCESS: 'success',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
}

// 进度状态
export const PROGRESS_STATUS = {
  WAITING: 'waiting',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  ERROR: 'error',
  CANCELLED: 'cancelled'
}

/**
 * 根据当前步骤计算总体进度百分比
 * @param {string} currentStep - 当前步骤
 * @param {number} stepProgress - 当前步骤内的进度 (0-100)
 * @returns {number} 总体进度 (0-100)
 */
export function calculateOverallProgress(currentStep, stepProgress = 0) {
  const stepIndex = STEP_ORDER.indexOf(currentStep)
  if (stepIndex === -1) return 0

  // 每个步骤占总进度的权重
  const stepWeight = 100 / (STEP_ORDER.length - 1) // 减1是因为COMPLETED不算在内

  // 已完成的步骤进度
  const completedProgress = stepIndex * stepWeight

  // 当前步骤的进度
  const currentStepProgress = (stepProgress / 100) * stepWeight

  return Math.min(100, Math.round(completedProgress + currentStepProgress))
}

/**
 * 获取步骤的显示状态
 * @param {string} step - 步骤
 * @param {string} currentStep - 当前步骤
 * @returns {string} 显示状态：'completed', 'active', 'pending', 'error'
 */
export function getStepDisplayStatus(step, currentStep) {
  if (currentStep === PROGRESS_STEPS.FAILED && step !== PROGRESS_STEPS.FAILED) {
    return 'error'
  }

  if (step === currentStep) {
    return 'active'
  }

  const currentIndex = STEP_ORDER.indexOf(currentStep)
  const stepIndex = STEP_ORDER.indexOf(step)

  if (stepIndex < currentIndex) {
    return 'completed'
  }

  return 'pending'
}