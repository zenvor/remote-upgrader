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

// 操作类型
export const OPERATION_TYPES = {
  UPGRADE: 'upgrade',
  ROLLBACK: 'rollback'
}

/**
 * 创建进度更新事件
 * @param {Object} options - 进度参数
 * @param {string} options.sessionId - 会话ID
 * @param {string} options.deviceId - 设备ID
 * @param {string} options.step - 当前步骤
 * @param {number} options.progress - 进度百分比
 * @param {string} [options.message] - 进度描述
 * @param {string} [options.status] - 状态标记 (running/completed/error)
 * @param {Error|null} [options.error] - 错误对象
 * @param {Object} [options.metadata] - 额外元数据
 * @returns {Object} 进度更新对象
 */
export function createProgressUpdate({
  sessionId,
  deviceId,
  step,
  progress,
  message = '',
  status = 'running',
  error = null,
  metadata = {}
}) {
  return {
    sessionId,
    deviceId,
    step,
    progress: Math.min(100, Math.max(0, progress || 0)),
    message,
    status,
    error,
    timestamp: new Date().toISOString(),
    metadata
  }
}
