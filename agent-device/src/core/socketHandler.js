// 中文注释：Socket 事件处理器（ESM 默认导出）
import { DateHelper, ErrorLogger } from '../utils/common.js'
import logger from '../utils/logger.js'

export default class SocketHandler {
  constructor(socket, agent) {
    // 参数验证
    if (!socket) {
      throw new Error('Socket 参数不能为空')
    }
    if (!agent) {
      throw new Error('Agent 参数不能为空')
    }

    this.socket = socket
    this.agent = agent

    // 常量配置
    this.constants = {
      heartbeatInterval: 30_000 // 30秒心跳间隔
    }

    // 状态管理
    this.heartbeatInterval = null
    this.systemInfo = null // 缓存系统信息模块

    this.setupEventListeners()
  }

  setupEventListeners() {
    // 设备注册响应
    this.socket.on('device:registered', (data) => {
      this.handleDeviceRegistered(data)
    })

    // 接收服务端命令
    this.socket.on('device:command', (data) => {
      this.handleCommand(data)
    })

    // 升级命令
    this.socket.on('cmd:upgrade', (data) => {
      this.handleUpgradeCommand(data, data?.commandId)
    })

    // 降级命令
    this.socket.on('cmd:rollback', (data) => {
      this.handleRollbackCommand(data, data?.commandId)
    })

    // 状态查询命令
    this.socket.on('cmd:status', (data) => {
      this.handleStatusCommand(data, data?.commandId)
    })

    // 心跳响应
    this.socket.on('device:heartbeat_ack', (data) => {
      this.handleHeartbeatPong(data)
    })

    // 服务端配置推送：deployPath 更新后立刻触发一次 storage 检测并上报
    this.socket.on('config:deploy-path', (data) => {
      if (data && data.deployPath) {
        this.agent.updateSystemInfoAfterRegistration(data.deployPath).catch((error) => {
          ErrorLogger.logError('配置部署路径后更新系统信息', error, {
            deployPath: data.deployPath
          })
        })
      }
    })

    // 服务端触发的即时网络刷新：收到后立刻执行一次网络信息采集与上报
    this.socket.on('config:refresh-network', () => {
      this.agent.updateNetworkInfo().catch((error) => {
        ErrorLogger.logError('刷新网络信息', error)
      })
    })

    // 开始心跳
    this.startHeartbeat()
  }

  handleDeviceRegistered(data) {
    logger.info('设备注册成功', {
      deviceId: data?.deviceId,
      message: data?.message
    })
    this.agent.reportStatus('registered')
    this.agent.updateSystemInfoAfterRegistration().catch((error) => {
      ErrorLogger.logError('注册后更新系统信息', error)
    })
  }

  async handleCommand(message) {
    logger.info('收到服务端命令', {
      command: message?.command,
      messageId: message?.messageId || message?.commandId || null
    })

    const command = message?.command
    const parameters = message?.params ?? message?.data ?? {}
    const messageId = message?.messageId || message?.commandId || null

    try {
      switch (command) {
        case 'cmd:upgrade': {
          await this.handleUpgradeCommand(parameters, messageId)
          break
        }

        case 'cmd:rollback': {
          await this.handleRollbackCommand(parameters, messageId)
          break
        }

        case 'cmd:status': {
          await this.handleStatusCommand(parameters, messageId)
          break
        }

        case 'getCurrentVersion': {
          await this.handleGetCurrentVersionCommand(parameters, messageId)
          break
        }

        case 'getDeployPath': {
          logger.warn('getDeployPath 命令已废弃，不再支持')
          if (messageId) {
            this.sendCommandResult(messageId, false, 'getDeployPath 命令已废弃')
          }

          break
        }

        default: {
          logger.warn('未知命令:', command)
          if (messageId) {
            this.sendCommandResult(messageId, false, '不支持的命令')
          }
        }
      }
    } catch (error) {
      ErrorLogger.logError('命令处理失败', error, { command, messageId })
      if (messageId) {
        this.sendCommandResult(messageId, false, error.message)
      }
    }
  }

  async handleUpgradeCommand(data, messageId = null) {
    const commandId = messageId || data?.commandId || null
    const batchTaskId = data?.batchTaskId || null // 批量任务ID
    let sessionId = null // 在函数顶部声明，确保在 catch 块中可见
    const deviceId = this.agent?.config?.device?.id || 'unknown'

    logger.info(`🎯 收到升级指令 [项目: ${data?.project || 'N/A'}] [包: ${data?.fileName || 'N/A'}] [会话: ${data?.sessionId || 'N/A'}] [消息ID: ${messageId || 'N/A'}] [批量ID: ${batchTaskId || 'N/A'}]`)

    try {
      // 检查是否可以执行升级操作
      const operationCheck = this.agent.canPerformOperation('upgrade')
      if (!operationCheck.canPerform) {
        const errorMessage = operationCheck.reason
        logger.warn(`升级指令被拒绝: ${errorMessage}`)

        // 通过 Socket 响应错误信息
        if (commandId) {
          this.socket.emit('command:response', {
            commandId,
            success: false,
            error: errorMessage,
            timestamp: new Date().toISOString()
          })
        }

        // 批量任务状态更新
        if (batchTaskId) {
          this.reportBatchTaskStatus(batchTaskId, 'failed', errorMessage, 0)
        }

        return
      }

      // 参数验证
      if (!data || typeof data !== 'object') {
        throw new Error('升级命令参数无效')
      }

      const { project, fileName, version, deployPath, preservedPaths = [] } = data
      sessionId = data.sessionId // 赋值给外层变量

      logger.info(`📊 会话ID检查: ${sessionId ? `已收到 ${sessionId}` : '未收到会话ID'}`)

      if (!project || !fileName) {
        throw new Error('升级命令缺少必需参数: project, fileName')
      }

      // 如果有 sessionId，设置进度回调
      if (sessionId) {
        logger.debug(`🔗 设置进度回调: ${sessionId}`)
        const deployManager = this.agent.getDeployManager()

        // 注册进度回调，用于实时进度更新
        deployManager.registerProgressCallback(sessionId, (progressUpdate) => {
          this.socket.emit('device:operation_progress', progressUpdate)
        })

        // 上报操作开始事件
        this.socket.emit('device:operation_start', {
          sessionId,
          deviceId,
          operationType: 'upgrade',
          project,
          version: version || null,
          timestamp: new Date().toISOString()
        })
      }

      // 报告状态（包括批量任务状态）
      this.agent.reportStatus('upgrading')
      if (batchTaskId) {
        this.reportBatchTaskStatus(batchTaskId, 'upgrading', null, 10)
      }

      // 1. 下载升级包
      logger.debug('开始下载升级包...')
      if (batchTaskId) {
        this.reportBatchTaskProgress(batchTaskId, 20, 1, 3, '正在下载升级包...')
      }

      // 创建下载进度回调
      const downloadProgressCallback = (step, progress, message, error = null) => {
        if (sessionId && this.agent.getDeployManager()) {
          this.agent.getDeployManager().emitProgress(sessionId, step, progress, message, error)
        }
      }

      const downloadResult = await this.agent
        .getDownloadManager()
        .downloadPackage(project, fileName, downloadProgressCallback)

      if (!downloadResult.success) {
        throw new Error(`下载失败: ${downloadResult.error}`)
      }

      // 2. 部署升级包
      logger.debug('开始部署升级包...')
      if (batchTaskId) {
        this.reportBatchTaskProgress(batchTaskId, 60, 2, 3, '正在部署升级包...')
      }

      const deployResult = await this.agent
        .getDeployManager()
        .deploy(project, downloadResult.filePath, version, deployPath, preservedPaths, sessionId)

      if (!deployResult.success) {
        throw new Error(`部署失败: ${deployResult.error}`)
      }

      this.agent.reportStatus('upgrade_success')
      if (batchTaskId) {
        this.reportBatchTaskStatus(batchTaskId, 'success', null, 100)
      }

      // 清理进度回调
      if (sessionId) {
        logger.debug(`🧹 清理进度回调: ${sessionId}`)
        this.agent.getDeployManager().removeProgressCallback(sessionId)
      }

      if (commandId) {
        const packageInfo = deployResult.packageInfo ? { ...deployResult.packageInfo } : null
        if (packageInfo && data.fileMD5) {
          packageInfo.fileMD5 = data.fileMD5
        }

        this.sendCommandResult(commandId, true, '升级成功', {
          operation: 'upgrade',
          project,
          version,
          deployPath: deployResult.deployPath || deployPath || null,
          packageInfo
        })
      }

      // 升级成功后刷新系统信息，确保回滚状态与磁盘信息更新
      const actualDeployPath = deployResult.deployPath || deployPath
      if (actualDeployPath) {
        this.agent.updateSystemInfoAfterRegistration(actualDeployPath).catch((error) => {
          ErrorLogger.logError('升级后更新系统信息失败', error, { deployPath: actualDeployPath })
        })
      }

      logger.debug('升级完成')
    } catch (error) {
      ErrorLogger.logError('升级失败', error, { project: data.project, commandId, batchTaskId })
      this.agent.reportStatus('upgrade_failed')

      // 清理进度回调（错误情况下）
      if (sessionId) {
        logger.debug(`🧹 清理进度回调（错误）: ${sessionId}`)
        this.agent.getDeployManager().removeProgressCallback(sessionId)
      }

      // 报告批量任务失败状态
      if (batchTaskId) {
        this.reportBatchTaskStatus(batchTaskId, 'failed', error.message)
      }

      if (commandId) {
        this.sendCommandResult(commandId, false, error.message)
      }
    }
  }

  async handleRollbackCommand(data, messageId = null) {
    logger.info('📨 收到回滚命令:', JSON.stringify(data, null, 2))

    const commandId = messageId || data?.commandId || null
    const batchTaskId = data?.batchTaskId || null // 批量任务ID
    const deviceId = this.agent?.config?.device?.id || 'unknown'
    const sessionId = data?.sessionId || null // 将 sessionId 声明移到方法开始处

    try {
      // 检查是否可以执行回滚操作
      const operationCheck = this.agent.canPerformOperation('rollback')
      if (!operationCheck.canPerform) {
        const errorMessage = operationCheck.reason
        logger.warn(`回滚指令被拒绝: ${errorMessage}`)

        // 通过 Socket 响应错误信息
        if (commandId) {
          this.socket.emit('command:response', {
            commandId,
            success: false,
            error: errorMessage,
            timestamp: new Date().toISOString()
          })
        }

        // 批量任务状态更新
        if (batchTaskId) {
          this.reportBatchTaskStatus(batchTaskId, 'failed', errorMessage, 0)
        }

        return
      }

      // 参数验证
      if (!data || typeof data !== 'object') {
        throw new Error('回滚命令参数无效')
      }

      const { project, preservedPaths } = data

      if (!project) {
        throw new Error('回滚命令缺少必需参数: project')
      }

      // 📋 详细白名单接收日志
      logger.info(`📋 设备 ${deviceId} 回滚白名单接收情况:`)
      logger.info(`  - 原始 preservedPaths 参数: ${JSON.stringify(preservedPaths)}`)
      logger.info(`  - preservedPaths 类型: ${typeof preservedPaths}`)
      logger.info(`  - 是否为数组: ${Array.isArray(preservedPaths)}`)

      const preservedPathsArray = Array.isArray(preservedPaths) ? preservedPaths : []
      logger.info(`  - 解析后白名单数组: ${JSON.stringify(preservedPathsArray)}`)
      logger.info(`  - 白名单项目数量: ${preservedPathsArray.length}`)

      if (preservedPathsArray.length > 0) {
        logger.info(`🛡️ 回滚白名单保护生效: ${preservedPathsArray.join(', ')}`)
      } else {
        logger.warn(`⚠️ 回滚无白名单保护 - 可能删除所有文件！`)
      }
      if (!sessionId) {
        logger.warn('⚠️ 回滚命令未提供 sessionId，无法上报精确进度')
      }
      if (sessionId) {
        logger.debug(`🔗 设置回滚进度回调: ${sessionId}`)
        const deployManager = this.agent.getDeployManager()
        deployManager.registerProgressCallback(sessionId, (progressUpdate) => {
          this.socket.emit('device:operation_progress', progressUpdate)
        })

        this.socket.emit('device:operation_start', {
          sessionId,
          deviceId,
          operationType: 'rollback',
          project,
          timestamp: new Date().toISOString()
        })
      }

      this.agent.reportStatus('rolling_back')
      if (batchTaskId) {
        this.reportBatchTaskStatus(batchTaskId, 'upgrading', null, 10)
        this.reportBatchTaskProgress(batchTaskId, 30, 1, 2, '正在执行回滚...')
      }

      // 🚀 调用回滚方法前的最终日志
      logger.info(`🚀 调用 deployManager.rollback():`)
      logger.info(`  - 项目: ${project}`)
      logger.info(`  - 目标版本: null (最新备份)`)
      logger.info(`  - 白名单数组: ${JSON.stringify(preservedPathsArray)}`)
      logger.info(`  - 会话ID: ${sessionId}`)

      const rollbackResult = await this.agent.getDeployManager().rollback(project, null, preservedPathsArray, sessionId)

      if (!rollbackResult.success) {
        throw new Error(`回滚失败: ${rollbackResult.error}`)
      }

      this.agent.reportStatus('rollback_success')
      if (batchTaskId) {
        this.reportBatchTaskStatus(batchTaskId, 'success', null, 100)
      }

      if (commandId) {
        this.sendCommandResult(commandId, true, '回滚成功', {
          operation: 'rollback',
          project,
          deployPath: rollbackResult.deployPath || null
        })
      }

      const targetPath =
        rollbackResult.deployPath ||
        (project === 'backend' ? this.agent.config.deploy.backendDir : this.agent.config.deploy.frontendDir)

      if (targetPath) {
        this.agent.updateSystemInfoAfterRegistration(targetPath).catch((error) => {
          ErrorLogger.logError('回滚后更新系统信息失败', error, { deployPath: targetPath })
        })
      }

      logger.debug('回滚完成')
    } catch (error) {
      ErrorLogger.logError('回滚失败', error, { project: data.project, commandId, batchTaskId })
      this.agent.reportStatus('rollback_failed')

      if (batchTaskId) {
        this.reportBatchTaskStatus(batchTaskId, 'failed', error.message)
      }

      if (commandId) {
        this.sendCommandResult(commandId, false, error.message)
      }
    } finally {
      if (sessionId) {
        logger.debug(`🧹 清理回滚进度回调: ${sessionId}`)
        this.agent.getDeployManager().removeProgressCallback(sessionId)
      }
    }
  }

  async handleStatusCommand(data, messageId = null) {
    logger.debug('查询设备状态:', data)

    const commandId = messageId || data?.commandId || null

    try {
      const systemUptime = await this.getSystemUptime()
      const deployManager = this.agent.getDeployManager()

      const status = {
        deviceId: this.agent.config.device.id,
        timestamp: DateHelper.getCurrentDate(),
        frontend: await deployManager.getCurrentVersion('frontend'),
        backend: await deployManager.getCurrentVersion('backend'),
        system: {
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          uptime: systemUptime, // 使用系统运行时间而不是进程运行时间
          memory: process.memoryUsage()
        }
      }

      if (commandId) {
        this.sendCommandResult(commandId, true, '状态查询成功', status)
      }
    } catch (error) {
      ErrorLogger.logError('状态查询失败', error, { commandId })
      if (commandId) {
        this.sendCommandResult(commandId, false, error.message)
      }
    }
  }

  handleHeartbeatPong(data) {
    // 心跳响应处理
    if (data && data.timestamp) {
      const now = Date.now()
      const sendTime = new Date(data.timestamp).getTime()
      const latency = now - sendTime
      logger.debug(`心跳延迟: ${latency}ms`)
    } else {
      logger.debug('心跳响应: 收到服务端确认')
    }
  }

  startHeartbeat() {
    // 清理旧的心跳定时器
    this.stopHeartbeat()

    // 每30秒发送一次心跳
    this.heartbeatInterval = setInterval(async () => {
      if (this.socket.connected) {
        try {
          const systemUptime = await this.getSystemUptime()

          this.socket.emit('device:heartbeat', {
            deviceId: this.agent.config.device.id,
            timestamp: Date.now(),
            health: {
              uptimeSeconds: systemUptime
            }
          })
        } catch (error) {
          ErrorLogger.logError('心跳发送失败', error)
        }
      }
    }, this.constants.heartbeatInterval)
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  async getSystemUptime() {
    try {
      // 懒加载并缓存系统信息模块
      if (!this.systemInfo) {
        this.systemInfo = await import('systeminformation')
      }

      const timeInfo = await this.systemInfo.default.time()
      return Math.floor(timeInfo.uptime)
    } catch (error) {
      ErrorLogger.logError('获取系统运行时间失败', error)
      // 返回进程运行时间作为fallback
      return Math.floor(process.uptime())
    }
  }

  sendCommandResult(commandId, success, message, data = null) {
    const response = {
      commandId,
      deviceId: this.agent.config.device.id,
      success,
      message,
      data,
      timestamp: DateHelper.getCurrentDate()
    }

    // 发送传统格式响应
    this.socket.emit('command:result', response)

    // 如果 commandId 看起来像 messageId (含有 cmd_ 前缀)，也发送新格式响应
    if (commandId && commandId.startsWith('cmd_')) {
      this.socket.emit(`response:${commandId}`, response)
    }
  }

  // 版本管理命令处理方法
  async handleGetCurrentVersionCommand(parameters, messageId = null) {
    logger.debug('📋 开始处理 getCurrentVersion 命令:', parameters)

    const commandId = messageId || parameters?.commandId || null

    try {
      const { project } = parameters

      if (!project || !['frontend', 'backend'].includes(project)) {
        if (commandId) {
          this.sendCommandResult(commandId, false, '项目类型参数无效，必须是 frontend 或 backend')
        }

        return
      }

      const deployManager = this.agent.getDeployManager()
      const versionInfo = await deployManager.getCurrentVersion(project)

      if (!versionInfo?.success) {
        throw new Error(versionInfo?.error || '获取版本信息失败')
      }

      if (commandId) {
        this.sendCommandResult(commandId, true, '获取当前版本成功', versionInfo)
      }
    } catch (error) {
      ErrorLogger.logError('获取当前版本失败', error, { project: parameters.project, commandId })
      if (commandId) {
        this.sendCommandResult(commandId, false, error.message)
      }
    }
  }

  /**
   * 发送通知到服务器
   */
  sendNotification(eventName, data) {
    try {
      if (this.socket && this.socket.connected) {
        this.socket.emit(eventName, data)
        logger.debug(`📡 已发送通知到服务器: ${eventName}`)
      } else {
        logger.warn('无法发送通知：Socket 未连接')
      }
    } catch (error) {
      ErrorLogger.logError('发送通知失败', error, { eventName })
    }
  }

  /**
   * 报告批量任务设备状态
   */
  reportBatchTaskStatus(batchTaskId, status, error = null, progress = null) {
    if (!batchTaskId) return

    try {
      const statusData = {
        taskId: batchTaskId,
        deviceId: this.agent.config.device.id,
        status,
        error,
        progress,
        timestamp: new Date().toISOString()
      }

      this.socket.emit('batch:device_status', statusData)
      logger.debug(`📊 批量任务状态报告: ${batchTaskId} - ${status}`)
    } catch (error) {
      ErrorLogger.logError('报告批量任务状态失败', error, { batchTaskId, status })
    }
  }

  /**
   * 报告批量任务设备进度
   */
  reportBatchTaskProgress(batchTaskId, progress, currentStep, totalSteps, message = '') {
    if (!batchTaskId) return

    try {
      const progressData = {
        taskId: batchTaskId,
        deviceId: this.agent.config.device.id,
        progress,
        currentStep,
        totalSteps,
        message,
        timestamp: new Date().toISOString()
      }

      this.socket.emit('batch:device_progress', progressData)
      logger.debug(`🔄 批量任务进度报告: ${batchTaskId} - ${progress}% (${currentStep}/${totalSteps})`)
    } catch (error) {
      ErrorLogger.logError('报告批量任务进度失败', error, { batchTaskId, progress })
    }
  }

  cleanup() {
    // 停止心跳
    this.stopHeartbeat()

    // 清理缓存的模块引用
    this.systemInfo = null
  }
}
