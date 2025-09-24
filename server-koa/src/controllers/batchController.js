// 批量操作控制器 - 处理批量升级和回滚相关的API请求
import BatchTaskManager, { TASK_STATUS, TASK_TYPE } from '../models/batchTaskManager.js'
import deviceManager from '../models/deviceManager.js'
import { getPackageConfig } from '../models/packageConfig.js'
import { ErrorLogger } from '../utils/common.js'

// 全局批量任务管理器实例
let batchTaskManager = null

/**
 * 初始化批量任务管理器
 */
export async function initializeBatchTaskManager() {
  try {
    batchTaskManager = new BatchTaskManager(deviceManager, deviceManager)
    await batchTaskManager.initialize()
    console.log('✅ 批量任务管理器初始化成功')
    return batchTaskManager
  } catch (error) {
    ErrorLogger.logError('批量任务管理器初始化失败', error)
    throw error
  }
}

/**
 * 获取批量任务管理器实例
 */
function getBatchTaskManager() {
  if (!batchTaskManager) {
    throw new Error('批量任务管理器未初始化')
  }
  return batchTaskManager
}

/**
 * 创建批量升级任务
 */
async function createBatchUpgrade(ctx) {
  try {
    const { deviceIds, packageFileName, project } = ctx.request.body

    // 参数验证
    if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
      ctx.status = 400
      ctx.body = {
        success: false,
        error: '设备ID列表不能为空'
      }
      return
    }

    if (!packageFileName) {
      ctx.status = 400
      ctx.body = {
        success: false,
        error: '包文件名不能为空'
      }
      return
    }

    if (!project || !['frontend', 'backend'].includes(project)) {
      ctx.status = 400
      ctx.body = {
        success: false,
        error: '项目类型必须是 frontend 或 backend'
      }
      return
    }

    // 验证设备ID有效性
    const onlineDevices = deviceManager.getOnlineDevices()
    const onlineDeviceIds = new Set(onlineDevices.map(d => d.deviceId))
    const validDeviceIds = deviceIds.filter(id => onlineDeviceIds.has(id))

    if (validDeviceIds.length === 0) {
      ctx.status = 400
      ctx.body = {
        success: false,
        error: '没有有效的在线设备'
      }
      return
    }

    // 获取包信息
    const packageConfig = await getPackageConfig()
    const packageInfo = packageConfig.packages[project]?.packages[packageFileName]

    if (!packageInfo) {
      ctx.status = 404
      ctx.body = {
        success: false,
        error: '指定的升级包不存在'
      }
      return
    }

    // 创建任务
    const taskManager = getBatchTaskManager()
    const taskId = await taskManager.createUpgradeTask({
      deviceIds: validDeviceIds,
      packageInfo: {
        fileName: packageFileName,
        version: packageInfo.version,
        fileMD5: packageInfo.fileMD5,
        packagePath: `packages/${project}/${packageFileName}`
      },
      project,
      creator: ctx.state.user?.username || 'system'
    })

    // 异步执行任务
    taskManager.executeTask(taskId).catch(error => {
      ErrorLogger.logError('批量升级任务执行失败', error, { taskId })
    })

    ctx.body = {
      success: true,
      taskId,
      message: '批量升级任务已创建',
      stats: {
        totalDevices: deviceIds.length,
        validDevices: validDeviceIds.length,
        invalidDevices: deviceIds.length - validDeviceIds.length
      }
    }

  } catch (error) {
    ErrorLogger.logError('创建批量升级任务失败', error)
    ctx.status = 500
    ctx.body = {
      success: false,
      error: process.env.NODE_ENV === 'production' ? '创建批量升级任务失败' : error.message
    }
  }
}

/**
 * 创建批量回滚任务
 */
async function createBatchRollback(ctx) {
  try {
    const { deviceIds, project } = ctx.request.body

    // 参数验证
    if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
      ctx.status = 400
      ctx.body = {
        success: false,
        error: '设备ID列表不能为空'
      }
      return
    }

    if (!project || !['frontend', 'backend'].includes(project)) {
      ctx.status = 400
      ctx.body = {
        success: false,
        error: '项目类型必须是 frontend 或 backend'
      }
      return
    }

    // 验证设备ID有效性
    const onlineDevices = deviceManager.getOnlineDevices()
    const onlineDeviceIds = new Set(onlineDevices.map(d => d.deviceId))
    const validDeviceIds = deviceIds.filter(id => onlineDeviceIds.has(id))

    if (validDeviceIds.length === 0) {
      ctx.status = 400
      ctx.body = {
        success: false,
        error: '没有有效的在线设备'
      }
      return
    }

    // 创建回滚任务
    const taskManager = getBatchTaskManager()
    const taskId = await taskManager.createRollbackTask({
      deviceIds: validDeviceIds,
      project,
      creator: ctx.state.user?.username || 'system'
    })

    // 异步执行任务
    taskManager.executeTask(taskId).catch(error => {
      ErrorLogger.logError('批量回滚任务执行失败', error, { taskId })
    })

    ctx.body = {
      success: true,
      taskId,
      message: '批量回滚任务已创建',
      stats: {
        totalDevices: deviceIds.length,
        validDevices: validDeviceIds.length,
        invalidDevices: deviceIds.length - validDeviceIds.length
      }
    }

  } catch (error) {
    ErrorLogger.logError('创建批量回滚任务失败', error)
    ctx.status = 500
    ctx.body = {
      success: false,
      error: process.env.NODE_ENV === 'production' ? '创建批量回滚任务失败' : error.message
    }
  }
}

/**
 * 获取批量任务列表
 */
async function getBatchTasks(ctx) {
  try {
    const {
      status,
      type,
      pageNum: pageNumber = 1,
      pageSize = 20
    } = ctx.query

    // 参数验证
    const page = Math.max(1, Number.parseInt(pageNumber) || 1)
    const size = Math.min(100, Math.max(1, Number.parseInt(pageSize) || 20))
    const offset = (page - 1) * size

    // 状态验证
    if (status && !Object.values(TASK_STATUS).includes(status)) {
      ctx.status = 400
      ctx.body = {
        success: false,
        error: `无效的任务状态: ${status}`
      }
      return
    }

    // 类型验证
    if (type && !Object.values(TASK_TYPE).includes(type)) {
      ctx.status = 400
      ctx.body = {
        success: false,
        error: `无效的任务类型: ${type}`
      }
      return
    }

    const taskManager = getBatchTaskManager()
    const result = taskManager.getTasks({
      status,
      type,
      limit: size,
      offset
    })

    ctx.body = {
      success: true,
      tasks: result.tasks,
      total: result.total,
      pageNum: page,
      pageSize: size,
      totalPages: Math.ceil(result.total / size)
    }

  } catch (error) {
    ErrorLogger.logError('获取批量任务列表失败', error)
    ctx.status = 500
    ctx.body = {
      success: false,
      error: process.env.NODE_ENV === 'production' ? '获取任务列表失败' : error.message
    }
  }
}

/**
 * 获取单个批量任务详情
 */
async function getBatchTask(ctx) {
  try {
    const { taskId } = ctx.params

    if (!taskId) {
      ctx.status = 400
      ctx.body = {
        success: false,
        error: '任务ID不能为空'
      }
      return
    }

    const taskManager = getBatchTaskManager()
    const task = taskManager.getTask(taskId)

    if (!task) {
      ctx.status = 404
      ctx.body = {
        success: false,
        error: '任务不存在'
      }
      return
    }

    ctx.body = {
      success: true,
      task
    }

  } catch (error) {
    ErrorLogger.logError('获取批量任务详情失败', error)
    ctx.status = 500
    ctx.body = {
      success: false,
      error: process.env.NODE_ENV === 'production' ? '获取任务详情失败' : error.message
    }
  }
}

/**
 * 取消批量任务
 */
async function cancelBatchTask(ctx) {
  try {
    const { taskId } = ctx.params

    if (!taskId) {
      ctx.status = 400
      ctx.body = {
        success: false,
        error: '任务ID不能为空'
      }
      return
    }

    const taskManager = getBatchTaskManager()
    await taskManager.cancelTask(taskId)

    ctx.body = {
      success: true,
      message: '任务已取消'
    }

  } catch (error) {
    ErrorLogger.logError('取消批量任务失败', error)

    if (error.message.includes('任务不存在')) {
      ctx.status = 404
    } else if (error.message.includes('无法取消')) {
      ctx.status = 400
    } else {
      ctx.status = 500
    }

    ctx.body = {
      success: false,
      error: process.env.NODE_ENV === 'production' ? '取消任务失败' : error.message
    }
  }
}

/**
 * 重试失败的设备
 */
async function retryFailedDevices(ctx) {
  try {
    const { taskId } = ctx.params

    if (!taskId) {
      ctx.status = 400
      ctx.body = {
        success: false,
        error: '任务ID不能为空'
      }
      return
    }

    const taskManager = getBatchTaskManager()
    await taskManager.retryFailedDevices(taskId)

    ctx.body = {
      success: true,
      message: '失败设备重试已启动'
    }

  } catch (error) {
    ErrorLogger.logError('重试失败设备失败', error)

    if (error.message.includes('任务不存在')) {
      ctx.status = 404
    } else if (error.message.includes('没有失败的设备') || error.message.includes('最大重试次数')) {
      ctx.status = 400
    } else {
      ctx.status = 500
    }

    ctx.body = {
      success: false,
      error: process.env.NODE_ENV === 'production' ? '重试失败' : error.message
    }
  }
}

/**
 * 获取批量任务系统统计信息
 */
async function getBatchTaskStats(ctx) {
  try {
    const taskManager = getBatchTaskManager()
    const stats = taskManager.getSystemStats()

    ctx.body = {
      success: true,
      stats
    }

  } catch (error) {
    ErrorLogger.logError('获取批量任务统计失败', error)
    ctx.status = 500
    ctx.body = {
      success: false,
      error: process.env.NODE_ENV === 'production' ? '获取统计信息失败' : error.message
    }
  }
}

/**
 * 更新设备任务状态（供Socket事件调用）
 */
export function updateDeviceTaskStatus(taskId, deviceId, status, error = null) {
  try {
    if (!batchTaskManager) {
      console.warn('批量任务管理器未初始化')
      return false
    }

    return batchTaskManager.updateDeviceStatus(taskId, deviceId, status, error)
  } catch (error) {
    ErrorLogger.logError('更新设备任务状态失败', error, { taskId, deviceId, status })
    return false
  }
}

/**
 * 清理过期任务（定时任务）
 */
export async function cleanupExpiredTasks() {
  try {
    if (!batchTaskManager) {
      console.warn('批量任务管理器未初始化')
      return
    }

    await batchTaskManager.cleanupExpiredTasks()
  } catch (error) {
    ErrorLogger.logError('清理过期任务失败', error)
  }
}

export {
  createBatchUpgrade,
  createBatchRollback,
  getBatchTasks,
  getBatchTask,
  cancelBatchTask,
  retryFailedDevices,
  getBatchTaskStats
}