// 批量任务管理器 - 负责批量升级和回滚任务的创建、调度和状态管理
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'fs-extra'
import { ErrorLogger } from '../utils/common.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const BATCH_TASKS_CONFIG_PATH = path.join(__dirname, '../../config/batchTasks.json')

/**
 * 批量任务状态枚举
 */
export const TASK_STATUS = {
  PENDING: 'pending',     // 待执行
  RUNNING: 'running',     // 执行中
  COMPLETED: 'completed', // 已完成
  FAILED: 'failed',       // 失败
  CANCELLED: 'cancelled'  // 已取消
}

/**
 * 设备任务状态枚举
 */
export const DEVICE_STATUS = {
  WAITING: 'waiting',     // 等待中
  UPGRADING: 'upgrading', // 升级中
  SUCCESS: 'success',     // 成功
  FAILED: 'failed',       // 失败
  TIMEOUT: 'timeout'      // 超时
}

/**
 * 任务类型枚举
 */
export const TASK_TYPE = {
  UPGRADE: 'upgrade',   // 升级任务
  ROLLBACK: 'rollback'  // 回滚任务
}

export default class BatchTaskManager {
  constructor(deviceManager, messageRouter) {
    this.deviceManager = deviceManager
    this.messageRouter = messageRouter || deviceManager
    this.tasks = new Map() // 内存中的任务缓存
    this.config = {
      maxConcurrentTasks: 5,        // 最大并发任务数
      deviceTimeout: 300000,        // 设备操作超时时间（5分钟）
      batchSize: 10,                // 分批处理的设备数量
      retryAttempts: 3,             // 重试次数
      taskRetentionDays: 30         // 任务保留天数
    }

    console.log('🚀 批量任务管理器已启动')
  }

  /**
   * 初始化任务管理器
   */
  async initialize() {
    try {
      // 确保配置目录存在
      await fs.ensureDir(path.dirname(BATCH_TASKS_CONFIG_PATH))

      // 加载现有任务
      await this.loadTasks()

      // 恢复未完成的任务
      await this.resumeUnfinishedTasks()

      console.log('📦 批量任务管理器初始化完成')
    } catch (error) {
      ErrorLogger.logError('批量任务管理器初始化', error)
      throw error
    }
  }

  /**
   * 创建批量升级任务
   */
  async createUpgradeTask(options) {
    const {
      deviceIds,
      packageInfo,
      project,
      deployPath = null,
      preservedPaths = [],
      creator = 'system'
    } = options

    // 参数验证
    this.validateTaskOptions(options)

    const safeDeployPath = typeof deployPath === 'string' && deployPath.trim().length > 0 ? deployPath.trim() : null
    const safePreservedPaths = Array.isArray(preservedPaths)
      ? preservedPaths
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter((item) => item.length > 0)
      : []

    const taskId = this.generateTaskId()
    const task = {
      id: taskId,
      type: TASK_TYPE.UPGRADE,
      status: TASK_STATUS.PENDING,
      creator,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),

      // 任务配置
      config: {
        project, // frontend 或 backend
        packageInfo: {
          fileName: packageInfo.fileName,
          version: packageInfo.version,
          fileMD5: packageInfo.fileMD5,
          packagePath: packageInfo.packagePath
        },
        deployPath: safeDeployPath,
        preservedPaths: safePreservedPaths,
        totalDevices: deviceIds.length,
        batchSize: this.config.batchSize,
        timeout: this.config.deviceTimeout
      },

      // 设备状态
      devices: deviceIds.map(deviceId => ({
        deviceId,
        status: DEVICE_STATUS.WAITING,
        startTime: null,
        endTime: null,
        error: null,
        retryCount: 0
      })),

      // 统计信息
      stats: {
        total: deviceIds.length,
        waiting: deviceIds.length,
        upgrading: 0,
        success: 0,
        failed: 0,
        timeout: 0
      },

      // 执行日志
      logs: [
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `创建批量升级任务，目标设备: ${deviceIds.length} 个，包: ${packageInfo.fileName}`,
          details: {
            deviceIds,
            packageInfo,
            deployPath: safeDeployPath,
            preservedPaths: safePreservedPaths
          }
        }
      ]
    }

    // 保存任务
    this.tasks.set(taskId, task)
    await this.saveTasks()

    console.log(`📋 创建批量升级任务: ${taskId}，设备数量: ${deviceIds.length}`)

    return taskId
  }

  /**
   * 创建批量回滚任务
   */
  async createRollbackTask(options) {
    const { deviceIds, project, creator = 'system' } = options

    // 参数验证
    this.validateRollbackOptions(options)

    const taskId = this.generateTaskId()
    const task = {
      id: taskId,
      type: TASK_TYPE.ROLLBACK,
      status: TASK_STATUS.PENDING,
      creator,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),

      // 任务配置
      config: {
        project, // frontend 或 backend
        totalDevices: deviceIds.length,
        batchSize: this.config.batchSize,
        timeout: this.config.deviceTimeout
      },

      // 设备状态
      devices: deviceIds.map(deviceId => ({
        deviceId,
        status: DEVICE_STATUS.WAITING,
        startTime: null,
        endTime: null,
        error: null,
        retryCount: 0
      })),

      // 统计信息
      stats: {
        total: deviceIds.length,
        waiting: deviceIds.length,
        upgrading: 0,
        success: 0,
        failed: 0,
        timeout: 0
      },

      // 执行日志
      logs: [
        {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `创建批量回滚任务，目标设备: ${deviceIds.length} 个，目标版本: 上一版本`,
          details: { deviceIds }
        }
      ]
    }

    // 保存任务
    this.tasks.set(taskId, task)
    await this.saveTasks()

    console.log(`📋 创建批量回滚任务: ${taskId}，设备数量: ${deviceIds.length}`)

    return taskId
  }

  /**
   * 执行批量任务
   */
  async executeTask(taskId) {
    const task = this.tasks.get(taskId)
    if (!task) {
      throw new Error(`任务不存在: ${taskId}`)
    }

    if (task.status !== TASK_STATUS.PENDING) {
      throw new Error(`任务状态不允许执行: ${task.status}`)
    }

    try {
      // 更新任务状态
      task.status = TASK_STATUS.RUNNING
      task.startTime = new Date().toISOString()
      task.updatedAt = new Date().toISOString()

      this.addTaskLog(task, 'info', '开始执行批量任务')

      // 分批处理设备
      const deviceBatches = this.createDeviceBatches(task.devices, task.config.batchSize)

      for (const batch of deviceBatches) {
        if (task.status === TASK_STATUS.CANCELLED) {
          break
        }

        // eslint-disable-next-line no-await-in-loop -- 需要顺序处理批次，避免系统负载过高
        await this.processBatch(task, batch)

        // 批次间短暂延迟，避免系统负载过高
        // eslint-disable-next-line no-await-in-loop -- 顺序延迟是必要的
        await this.delay(1000)
      }

      // 任务完成，更新最终状态
      this.finalizeTask(task)
      await this.saveTasks()

      console.log(`✅ 批量任务完成: ${taskId}，成功: ${task.stats.success}，失败: ${task.stats.failed}`)

    } catch (error) {
      task.status = TASK_STATUS.FAILED
      task.endTime = new Date().toISOString()
      task.updatedAt = new Date().toISOString()

      this.addTaskLog(task, 'error', '任务执行失败', { error: error.message })
      await this.saveTasks()

      ErrorLogger.logError('批量任务执行失败', error, { taskId })
      throw error
    }
  }

  /**
   * 处理设备批次
   */
  async processBatch(task, deviceBatch) {
    const promises = deviceBatch.map(device => this.processDevice(task, device))

    // 等待批次中所有设备处理完成
    await Promise.allSettled(promises)

    // 更新任务统计
    this.updateTaskStats(task)
    await this.saveTasks()
  }

  /**
   * 处理单个设备
   */
  async processDevice(task, device) {
    try {
      // 检查设备是否在线
      if (!this.deviceManager.isDeviceOnline(device.deviceId)) {
        device.status = DEVICE_STATUS.FAILED
        device.error = '设备离线'
        device.endTime = new Date().toISOString()
        return
      }

      // 更新设备状态
      device.status = DEVICE_STATUS.UPGRADING
      device.startTime = new Date().toISOString()

      // 发送任务命令
      const success = await this.sendTaskCommand(task, device)

      if (success) {
        // 等待设备完成操作
        await this.waitForDeviceCompletion(task, device)
      } else {
        device.status = DEVICE_STATUS.FAILED
        device.error = '命令发送失败'
        device.endTime = new Date().toISOString()
      }

    } catch (error) {
      device.status = DEVICE_STATUS.FAILED
      device.error = error.message
      device.endTime = new Date().toISOString()

      ErrorLogger.logError('设备处理失败', error, {
        taskId: task.id,
        deviceId: device.deviceId
      })
    }
  }

  /**
   * 发送任务命令到设备
   */
  async sendTaskCommand(task, device) {
    const command = task.type === TASK_TYPE.UPGRADE ? 'cmd:upgrade' : 'cmd:rollback'

    let commandData
    if (task.type === TASK_TYPE.UPGRADE) {
      const deployPath = task.config.deployPath
      const preserved = Array.isArray(task.config.preservedPaths) ? task.config.preservedPaths : []
      commandData = {
        project: task.config.project,
        fileName: task.config.packageInfo.fileName,
        version: task.config.packageInfo.version,
        fileMD5: task.config.packageInfo.fileMD5,
        packagePath: task.config.packageInfo.packagePath,
        batchTaskId: task.id // 添加批量任务标识
      }

      if (deployPath) {
        commandData.deployPath = deployPath
      }
      if (preserved.length > 0) {
        commandData.preservedPaths = preserved
      }
    } else {
      commandData = {
        project: task.config.project,
        batchTaskId: task.id // 添加批量任务标识
      }
    }

    return this.messageRouter.sendToDevice(device.deviceId, command, commandData)
  }

  /**
   * 等待设备完成操作
   */
  async waitForDeviceCompletion(task, device) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        device.status = DEVICE_STATUS.TIMEOUT
        device.error = '操作超时'
        device.endTime = new Date().toISOString()
        resolve()
      }, task.config.timeout)

      // 监听设备状态更新（这里简化处理，实际需要通过事件监听）
      const checkInterval = setInterval(() => {
        if (device.status === DEVICE_STATUS.SUCCESS ||
            device.status === DEVICE_STATUS.FAILED ||
            device.status === DEVICE_STATUS.TIMEOUT) {
          clearTimeout(timeout)
          clearInterval(checkInterval)
          resolve()
        }
      }, 1000)
    })
  }

  /**
   * 更新设备任务状态（由外部调用）
   */
  updateDeviceStatus(taskId, deviceId, status, error = null) {
    const task = this.tasks.get(taskId)
    if (!task) return false

    const device = task.devices.find(d => d.deviceId === deviceId)
    if (!device) return false

    device.status = status
    device.endTime = new Date().toISOString()
    if (error) {
      device.error = error
    }

    this.updateTaskStats(task)
    this.saveTasks() // 异步保存

    return true
  }

  /**
   * 获取任务列表
   */
  getTasks(options = {}) {
    const { status, type, limit = 50, offset = 0 } = options

    let tasksArray = Array.from(this.tasks.values())

    // 状态筛选
    if (status) {
      tasksArray = tasksArray.filter(task => task.status === status)
    }

    // 类型筛选
    if (type) {
      tasksArray = tasksArray.filter(task => task.type === type)
    }

    // 按创建时间降序排序
    tasksArray.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    // 分页
    const total = tasksArray.length
    const tasks = tasksArray.slice(offset, offset + limit)

    return {
      tasks: tasks.map(task => this.formatTaskForResponse(task)),
      total,
      offset,
      limit
    }
  }

  /**
   * 获取单个任务详情
   */
  getTask(taskId) {
    const task = this.tasks.get(taskId)
    if (!task) return null

    return this.formatTaskForResponse(task, true) // 包含详细信息
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId) {
    const task = this.tasks.get(taskId)
    if (!task) {
      throw new Error(`任务不存在: ${taskId}`)
    }

    if (task.status === TASK_STATUS.COMPLETED || task.status === TASK_STATUS.CANCELLED) {
      throw new Error(`任务已完成或已取消，无法取消: ${task.status}`)
    }

    task.status = TASK_STATUS.CANCELLED
    task.endTime = new Date().toISOString()
    task.updatedAt = new Date().toISOString()

    this.addTaskLog(task, 'info', '任务已被取消')
    await this.saveTasks()

    console.log(`❌ 批量任务已取消: ${taskId}`)
    return true
  }

  /**
   * 重试失败的设备
   */
  async retryFailedDevices(taskId) {
    const task = this.tasks.get(taskId)
    if (!task) {
      throw new Error(`任务不存在: ${taskId}`)
    }

    const failedDevices = task.devices.filter(d =>
      d.status === DEVICE_STATUS.FAILED || d.status === DEVICE_STATUS.TIMEOUT
    )

    if (failedDevices.length === 0) {
      throw new Error('没有失败的设备需要重试')
    }

    // 检查重试次数限制
    const retriableDevices = failedDevices.filter(d => d.retryCount < this.config.retryAttempts)

    if (retriableDevices.length === 0) {
      throw new Error('所有失败设备都已达到最大重试次数')
    }

    // 重置设备状态并增加重试次数
    retriableDevices.forEach(device => {
      device.status = DEVICE_STATUS.WAITING
      device.error = null
      device.startTime = null
      device.endTime = null
      device.retryCount++
    })

    // 更新任务状态
    task.status = TASK_STATUS.RUNNING
    task.updatedAt = new Date().toISOString()

    this.addTaskLog(task, 'info', `重试失败设备: ${retriableDevices.length} 个`)

    // 处理重试设备
    const deviceBatches = this.createDeviceBatches(retriableDevices, task.config.batchSize)

    for (const batch of deviceBatches) {
      if (task.status === TASK_STATUS.CANCELLED) {
        break
      }

      // eslint-disable-next-line no-await-in-loop -- 需要顺序处理批次，避免系统负载过高
      await this.processBatch(task, batch)
      // eslint-disable-next-line no-await-in-loop -- 顺序延迟是必要的
      await this.delay(1000)
    }

    // 完成重试
    this.finalizeTask(task)
    await this.saveTasks()

    console.log(`🔄 任务重试完成: ${taskId}，重试设备: ${retriableDevices.length} 个`)
    return true
  }

  // === 辅助方法 ===

  /**
   * 生成任务ID
   */
  generateTaskId() {
    return `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  /**
   * 验证任务选项
   */
  validateTaskOptions(options) {
    const { deviceIds, packageInfo, project, deployPath, preservedPaths } = options

    if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
      throw new Error('设备ID列表不能为空')
    }

    if (!packageInfo || !packageInfo.fileName) {
      throw new Error('包信息不完整')
    }

    if (!project || !['frontend', 'backend'].includes(project)) {
      throw new Error('项目类型必须是 frontend 或 backend')
    }

    if (deployPath != null && typeof deployPath !== 'string') {
      throw new Error('部署路径必须是字符串')
    }

    if (preservedPaths != null && !Array.isArray(preservedPaths)) {
      throw new Error('保护文件列表必须是数组')
    }
  }

  /**
   * 验证回滚选项
   */
  validateRollbackOptions(options) {
    const { deviceIds, project } = options

    if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
      throw new Error('设备ID列表不能为空')
    }

    if (!project || !['frontend', 'backend'].includes(project)) {
      throw new Error('项目类型必须是 frontend 或 backend')
    }
  }

  /**
   * 创建设备批次
   */
  createDeviceBatches(devices, batchSize) {
    const batches = []
    for (let i = 0; i < devices.length; i += batchSize) {
      batches.push(devices.slice(i, i + batchSize))
    }
    return batches
  }

  /**
   * 更新任务统计
   */
  updateTaskStats(task) {
    const stats = {
      total: task.devices.length,
      waiting: 0,
      upgrading: 0,
      success: 0,
      failed: 0,
      timeout: 0
    }

    task.devices.forEach(device => {
      stats[device.status]++
    })

    task.stats = stats
    task.updatedAt = new Date().toISOString()
  }

  /**
   * 完成任务
   */
  finalizeTask(task) {
    const hasFailures = task.stats.failed > 0 || task.stats.timeout > 0
    const hasSuccess = task.stats.success > 0

    if (hasFailures && !hasSuccess) {
      task.status = TASK_STATUS.FAILED
    } else if (hasFailures && hasSuccess) {
      task.status = TASK_STATUS.COMPLETED // 部分成功也算完成
    } else {
      task.status = TASK_STATUS.COMPLETED
    }

    task.endTime = new Date().toISOString()
    task.updatedAt = new Date().toISOString()

    this.addTaskLog(task, 'info',
      `任务完成，成功: ${task.stats.success}，失败: ${task.stats.failed + task.stats.timeout}`
    )
  }

  /**
   * 添加任务日志
   */
  addTaskLog(task, level, message, details = null) {
    task.logs.push({
      timestamp: new Date().toISOString(),
      level,
      message,
      details
    })

    // 限制日志条数，避免内存过度占用
    if (task.logs.length > 1000) {
      task.logs = task.logs.slice(-500) // 保留最新的500条
    }
  }

  /**
   * 格式化任务响应
   */
  formatTaskForResponse(task, includeDetails = false) {
    const response = {
      id: task.id,
      type: task.type,
      status: task.status,
      creator: task.creator,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      startTime: task.startTime || null,
      endTime: task.endTime || null,
      config: task.config,
      stats: task.stats
    }

    if (includeDetails) {
      response.devices = task.devices
      response.logs = task.logs.slice(-100) // 返回最新100条日志
    }

    return response
  }

  /**
   * 延迟函数
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 加载任务
   */
  async loadTasks() {
    try {
      if (await fs.pathExists(BATCH_TASKS_CONFIG_PATH)) {
        const data = await fs.readJSON(BATCH_TASKS_CONFIG_PATH)

        if (data.tasks) {
          for (const task of data.tasks) {
            this.tasks.set(task.id, task)
          }
          console.log(`📥 加载批量任务: ${data.tasks.length} 个`)
        }
      }
    } catch (error) {
      ErrorLogger.logError('加载批量任务失败', error)
    }
  }

  /**
   * 保存任务
   */
  async saveTasks() {
    try {
      const data = {
        tasks: Array.from(this.tasks.values()),
        lastUpdated: new Date().toISOString()
      }

      await fs.outputJSON(BATCH_TASKS_CONFIG_PATH, data, { spaces: 2 })
    } catch (error) {
      ErrorLogger.logError('保存批量任务失败', error)
    }
  }

  /**
   * 恢复未完成的任务
   */
  async resumeUnfinishedTasks() {
    const unfinishedTasks = Array.from(this.tasks.values()).filter(task =>
      task.status === TASK_STATUS.RUNNING
    )

    for (const task of unfinishedTasks) {
      // 将运行中的任务标记为失败，需要手动重试
      task.status = TASK_STATUS.FAILED
      task.endTime = new Date().toISOString()
      this.addTaskLog(task, 'warning', '系统重启，任务被中断')
    }

    if (unfinishedTasks.length > 0) {
      await this.saveTasks()
      console.log(`⚠️ 恢复未完成任务: ${unfinishedTasks.length} 个（已标记为失败）`)
    }
  }

  /**
   * 清理过期任务
   */
  async cleanupExpiredTasks() {
    const expireDate = new Date()
    expireDate.setDate(expireDate.getDate() - this.config.taskRetentionDays)

    const expiredTasks = Array.from(this.tasks.values()).filter(task =>
      new Date(task.createdAt) < expireDate
    )

    for (const task of expiredTasks) {
      this.tasks.delete(task.id)
    }

    if (expiredTasks.length > 0) {
      await this.saveTasks()
      console.log(`🗑️ 清理过期任务: ${expiredTasks.length} 个`)
    }
  }

  /**
   * 获取系统统计信息
   */
  getSystemStats() {
    const tasks = Array.from(this.tasks.values())

    const stats = {
      totalTasks: tasks.length,
      pendingTasks: tasks.filter(t => t.status === TASK_STATUS.PENDING).length,
      runningTasks: tasks.filter(t => t.status === TASK_STATUS.RUNNING).length,
      completedTasks: tasks.filter(t => t.status === TASK_STATUS.COMPLETED).length,
      failedTasks: tasks.filter(t => t.status === TASK_STATUS.FAILED).length,
      cancelledTasks: tasks.filter(t => t.status === TASK_STATUS.CANCELLED).length,

      upgradeTasksCount: tasks.filter(t => t.type === TASK_TYPE.UPGRADE).length,
      rollbackTasksCount: tasks.filter(t => t.type === TASK_TYPE.ROLLBACK).length,

      totalDevicesProcessed: tasks.reduce((sum, task) => sum + task.stats.total, 0),
      totalSuccessDevices: tasks.reduce((sum, task) => sum + task.stats.success, 0),
      totalFailedDevices: tasks.reduce((sum, task) => sum + (task.stats.failed + task.stats.timeout), 0)
    }

    return stats
  }
}
