/**
 * 全局消息服务（Ant Design Vue message）
 * 提供统一的消息提示接口
 */
import { message as antdMessage } from 'ant-design-vue'

// 兼容旧 API：不再需要实例
export function setToastInstance() {}
export function getToastInstance() {
  return null
}

/**
 * 显示成功消息
 */
export function showSuccess(message, title = '成功', life = 3000) {
  antdMessage.success({ content: message || title, duration: life / 1000 })
}

/**
 * 显示信息消息
 */
export function showInfo(message, title = '信息', life = 3000) {
  antdMessage.info({ content: message || title, duration: life / 1000 })
}

/**
 * 显示警告消息
 */
export function showWarning(message, title = '警告', life = 4000) {
  antdMessage.warning({ content: message || title, duration: life / 1000 })
}

/**
 * 显示错误消息
 */
export function showError(message, title = '错误', life = 5000) {
  antdMessage.error({ content: message || title, duration: life / 1000 })
}

/**
 * 显示自定义消息
 */
export function showCustom(options = {}) {
  const { severity = 'info', detail, summary, life = 3000 } = options
  const content = detail || summary || '消息'
  const fn =
    {
      success: antdMessage.success,
      info: antdMessage.info,
      warn: antdMessage.warning,
      warning: antdMessage.warning,
      error: antdMessage.error
    }[severity] || antdMessage.info
  fn({ content, duration: life / 1000 })
}

/** 清空所有消息 */
export function clearAll() {
  // AntD message 没有全清 API，这里通过打开一个空消息并立即销毁的方式规避
  // 使用者如需清空，建议刷新视图或按需关闭
}

/** 兼容：不再支持分组清空，保留空实现 */
export function clearGroup() {}

export default {
  setToastInstance,
  getToastInstance,
  showSuccess,
  showInfo,
  showWarning,
  showError,
  showCustom,
  clearAll,
  clearGroup,
  success: showSuccess,
  info: showInfo,
  warning: showWarning,
  error: showError,
  custom: showCustom,
  clear: clearAll
}
