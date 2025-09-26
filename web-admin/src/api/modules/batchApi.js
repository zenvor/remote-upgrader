// 批量操作API模块
import request from '../request.js'

/**
 * 创建批量升级任务
 * @param {Object} data - 升级任务参数
 * @param {string[]} data.deviceIds - 设备ID列表
 * @param {string} data.packageFileName - 升级包文件名
 * @param {string} data.project - 项目类型 (frontend/backend)
 * @param {string} [data.deployPath] - 自定义部署路径，可选
 * @param {string[]} [data.preservedPaths] - 升级时需要保护的文件或目录
 * @returns {Promise<Object>} 任务创建结果
 */
export function createBatchUpgrade(data) {
  return request.post('/api/batch/upgrade', data)
}

/**
 * 创建批量回滚任务
 * @param {Object} data - 回滚任务参数
 * @param {string[]} data.deviceIds - 设备ID列表
 * @param {string} data.project - 项目类型 (frontend/backend)
 * @returns {Promise<Object>} 任务创建结果
 */
export function createBatchRollback(data) {
  return request.post('/api/batch/rollback', data)
}

/**
 * 获取批量任务列表
 * @param {Object} params - 查询参数
 * @param {string} [params.status] - 任务状态筛选
 * @param {string} [params.type] - 任务类型筛选
 * @param {number} [params.pageNum] - 页码
 * @param {number} [params.pageSize] - 每页数量
 * @returns {Promise<Object>} 任务列表
 */
export function getBatchTasks(params = {}) {
  return request.get('/api/batch/tasks', params)
}

/**
 * 获取单个批量任务详情
 * @param {string} taskId - 任务ID
 * @returns {Promise<Object>} 任务详情
 */
export function getBatchTask(taskId) {
  return request.get(`/api/batch/tasks/${taskId}`)
}

/**
 * 取消批量任务
 * @param {string} taskId - 任务ID
 * @returns {Promise<Object>} 取消结果
 */
export function cancelBatchTask(taskId) {
  return request.delete(`/api/batch/tasks/${taskId}`)
}

/**
 * 重试失败的设备
 * @param {string} taskId - 任务ID
 * @returns {Promise<Object>} 重试结果
 */
export function retryFailedDevices(taskId) {
  return request.post(`/api/batch/tasks/${taskId}/retry`)
}

/**
 * 获取批量任务系统统计信息
 * @returns {Promise<Object>} 统计信息
 */
export function getBatchTaskStats() {
  return request.get('/api/batch/stats')
}

// 导出所有API为对象
export default {
  createBatchUpgrade,
  createBatchRollback,
  getBatchTasks,
  getBatchTask,
  cancelBatchTask,
  retryFailedDevices,
  getBatchTaskStats
}
