// 中文注释：ESM 导入
import deviceManager from '../models/deviceManager.js'
import { getDeviceDeployPaths, getAllDevices as getStoredDevices, saveDevicePreservedPaths, getDevicePreservedPaths } from '../models/deviceStorage.js'
import { initializeBatchTaskManager } from './batchController.js'
import { getPackageConfig } from '../models/packageConfig.js'
import { ErrorLogger } from '../utils/common.js'

/**
 * 获取设备列表（支持筛选和分页）
 */
async function getDevices(ctx) {
  const {
    status, // 状态筛选: all, online, offline, upgrading, error
    search, // 搜索关键词: 设备名称或ID
    pageNum: pageNumber = 1, // 页码
    pageSize = 20 // 每页数量
  } = ctx.query

  try {
    // 获取内存中的设备状态信息（实时状态）
    const liveDevices = deviceManager.getAllDevices()

    // 获取存储中的完整设备信息（包括版本信息）
    const storedDevices = await getStoredDevices()

    // 合并实时状态和存储的完整信息
    let devicesWithConfig = storedDevices.map((storedDevice) => {
      // 查找对应的实时设备状态
      const liveDevice = liveDevices.find((d) => d.deviceId === storedDevice.deviceId)

      // 提取部署信息，支持新旧配置结构
      const deployInfo = storedDevice.deploy || {}

      // 兼容新旧配置结构
      let currentDeployments
      if (deployInfo.currentDeployments) {
        // 新配置结构
        currentDeployments = deployInfo.currentDeployments
      } else {
        // 使用新的扁平结构：deploy.frontend 和 deploy.backend
        const frontend = deployInfo.frontend || { version: null, deployDate: null, deployPath: null }
        const backend = deployInfo.backend || { version: null, deployDate: null, deployPath: null }

        currentDeployments = {
          frontend: {
            version: frontend.version || 'unknown',
            deployDate: frontend.deployDate || null,
            deployPath: frontend.deployPath || null,
            status: 'unknown',
            lastOperationType: null,
            lastOperationDate: null
          },
          backend: {
            version: backend.version || 'unknown',
            deployDate: backend.deployDate || null,
            deployPath: backend.deployPath || null,
            status: 'unknown',
            lastOperationType: null,
            lastOperationDate: null
          }
        }
      }

      // 是否存在任一部署路径（由 currentDeployments 派生）
      const hasDeployPath = Boolean(currentDeployments.frontend?.deployPath || currentDeployments.backend?.deployPath)

      return {
        // 基本信息
        deviceId: storedDevice.deviceId,
        deviceName: storedDevice.deviceName || storedDevice.deviceId,
        status: liveDevice?.status || 'offline',

        // 系统信息（扁平化）
        platform: storedDevice.system?.platform || null,
        osVersion: storedDevice.system?.osVersion || null,
        arch: storedDevice.system?.arch || null,
        agentVersion: storedDevice.agent?.agentVersion || null,

        // 网络信息（扁平化）
        wifiName: storedDevice.network?.wifiName || null,
        localIp: storedDevice.network?.localIp || null,
        macAddresses: storedDevice.network?.macAddresses || [],

        // 版本信息（扁平化）
        frontendVersion: currentDeployments.frontend?.version || null,
        backendVersion: currentDeployments.backend?.version || null,
        frontendDeployPath: currentDeployments.frontend?.deployPath || null,
        backendDeployPath: currentDeployments.backend?.deployPath || null,

        // 存储信息（扁平化）
        diskFreeBytes: storedDevice.storage?.diskFreeBytes || null,
        writable: storedDevice.storage?.writable || null,

        // 健康状态（扁平化）
        uptimeSeconds: storedDevice.health?.uptimeSeconds || null,

        // 连接信息
        connectedAt: liveDevice?.connectedAt || null,
        disconnectedAt: liveDevice?.disconnectedAt || null,
        lastHeartbeat: liveDevice?.lastHeartbeat || null,

        // 部署能力标识
        hasDeployPath,
        rollbackAvailable: deployInfo.rollbackAvailable || false,

        // 部署详情（用于详情页面显示）
        deployInfo: {
          rollbackAvailable: deployInfo.rollbackAvailable || false,
          lastDeployStatus: deployInfo.lastDeployStatus || null,
          lastDeployAt: deployInfo.lastDeployAt || null,
          lastRollbackAt: deployInfo.lastRollbackAt || null,
          frontend: {
            version: currentDeployments.frontend?.version || null,
            deployDate: currentDeployments.frontend?.deployDate || null,
            deployPath: currentDeployments.frontend?.deployPath || null
          },
          backend: {
            version: currentDeployments.backend?.version || null,
            deployDate: currentDeployments.backend?.deployDate || null,
            deployPath: currentDeployments.backend?.deployPath || null
          }
        },

        // 升级历史
        upgradeHistory: storedDevice.upgradeHistory || [],

        // 白名单配置
        preservedPaths: storedDevice.preservedPaths || {},

        // 当前操作进度信息（来自内存中的实时状态）
        currentOperation: liveDevice?.currentOperation || null
      }
    })

    // 状态筛选 - 只有当 status 有值且不为空时才进行筛选
    if (status && status.trim()) {
      devicesWithConfig = devicesWithConfig.filter((device) => device.status === status)
    }

    // 搜索筛选（设备名称、设备ID或WiFi名称）
    if (search && search.trim() && search.trim().length <= 100) {
      const searchTerm = search.trim().toLowerCase()
      devicesWithConfig = devicesWithConfig.filter((device) => {
        return (
          device.deviceName.toLowerCase().includes(searchTerm) ||
          device.deviceId.toLowerCase().includes(searchTerm) ||
          (device.wifiName && device.wifiName.toLowerCase().includes(searchTerm))
        )
      })
    }

    const total = devicesWithConfig.length

    // 分页处理及参数验证
    const page = Math.max(1, Number.parseInt(pageNumber) || 1)
    const size = Math.min(100, Math.max(1, Number.parseInt(pageSize) || 20))
    const startIndex = (page - 1) * size
    const endIndex = startIndex + size
    const paginatedDevices = devicesWithConfig.slice(startIndex, endIndex)

    ctx.body = {
      success: true,
      devices: paginatedDevices,
      total,
      pageNum: page,
      pageSize: size,
      totalPages: Math.ceil(total / size),
      onlineCount: deviceManager.getOnlineDevices().length
    }
  } catch (error) {
    console.error('获取设备列表失败:', error)
    ctx.status = 500
    ctx.body = {
      success: false,
      error: process.env.NODE_ENV === 'production' ? '获取设备列表失败' : error.message
    }
  }
}

/**
 * 向设备发送命令
 */
async function sendCommand(ctx) {
  const { deviceId } = ctx.params
  const { command, data } = ctx.request.body

  if (!command) {
    ctx.status = 400
    ctx.body = {
      success: false,
      error: '缺少 command 参数'
    }
    return
  }

  try {
    const payload = data && typeof data === 'object' ? { ...data } : {}

    // 废弃警告：升级和回滚命令已改为通过批量管理器处理
    if (command === 'cmd:upgrade' || command === 'cmd:rollback') {
      console.warn(`⚠️ 通过 sendCommand 发送 ${command} 已废弃，请使用专用的升级/回滚接口`)
      ctx.status = 400
      ctx.body = {
        success: false,
        error: `${command} 命令已废弃，请使用 /devices/:deviceId/upgrade 或 /devices/:deviceId/rollback 接口`
      }
      return
    }

    const success = deviceManager.sendToDevice(deviceId, command, payload)

    if (!success) {
      ctx.status = 404
      ctx.body = {
        success: false,
        error: '设备不在线或不存在'
      }
      return
    }

    // 如果是升级命令且发送成功，保存白名单配置
    if (command === 'cmd:upgrade' && success && payload.preservedPaths) {
      try {
        await saveDevicePreservedPaths(deviceId, payload.project, payload.preservedPaths)
      } catch (error) {
        console.warn(`保存设备 ${deviceId} 白名单配置失败:`, error.message)
        // 不中断响应，白名单配置保存失败不影响升级命令发送
      }
    }

    ctx.body = {
      success: true,
      message: '命令发送成功',
      command,
      data: payload
    }
  } catch (error) {
    console.error('发送命令失败:', error)
    ctx.status = 500
    ctx.body = {
      success: false,
      error: process.env.NODE_ENV === 'production' ? '发送命令失败' : error.message
    }
  }
}

/**
 * 单设备升级 - 通过任务管理器记录
 */
async function upgradeDevice(ctx) {
  try {
    const { deviceId } = ctx.params
    const {
      project,
      fileName,
      version,
      fileMD5,
      deployPath,
      preservedPaths = [],
      sessionId
    } = ctx.request.body

    // 记录升级请求详情
    console.log(`🚀 收到升级请求 [设备: ${deviceId}] [项目: ${project}] [包: ${fileName}] [会话: ${sessionId || 'N/A'}] [来源IP: ${ctx.request.ip}]`)

    // 参数验证
    if (!project || !['frontend', 'backend'].includes(project)) {
      ctx.status = 400
      ctx.body = {
        success: false,
        error: '项目类型必须是 frontend 或 backend'
      }
      return
    }

    if (!fileName) {
      ctx.status = 400
      ctx.body = {
        success: false,
        error: '升级包文件名不能为空'
      }
      return
    }

    // 检查设备是否可以执行升级操作
    const operationCheck = deviceManager.canPerformOperation(deviceId, 'upgrade')
    if (!operationCheck.canPerform) {
      ctx.status = 409 // Conflict
      ctx.body = {
        success: false,
        error: operationCheck.reason
      }
      return
    }

    // 获取包信息
    const packageConfig = await getPackageConfig()
    const packageInfo = packageConfig.packages[project]?.packages[fileName]

    if (!packageInfo) {
      ctx.status = 404
      ctx.body = {
        success: false,
        error: '指定的升级包不存在'
      }
      return
    }

    // 创建单设备任务记录
    const batchTaskManager = await initializeBatchTaskManager()
    const taskId = await batchTaskManager.createUpgradeTask({
      deviceIds: [deviceId],
      packageInfo: {
        fileName,
        version: version || packageInfo.version,
        fileMD5: fileMD5 || packageInfo.fileMD5,
        packagePath: `packages/${project}/${fileName}`
      },
      project,
      deployPath,
      preservedPaths,
      sessionId, // 传递会话ID以支持进度追踪
      creator: ctx.state.user?.username || 'system',
      scope: 'single'
    })

    // 保存白名单配置
    if (preservedPaths && preservedPaths.length > 0) {
      try {
        await saveDevicePreservedPaths(deviceId, project, preservedPaths)
      } catch (error) {
        console.warn(`保存设备 ${deviceId} 白名单配置失败:`, error.message)
      }
    }

    // 异步执行升级任务（不等待完成，立即返回）
    batchTaskManager.executeTask(taskId).catch(error => {
      ErrorLogger.logError('单设备升级任务执行失败', error, { taskId, deviceId })
      console.error(`❌ 单设备升级任务执行失败: ${taskId}`, error.message)
    })

    console.log(`✅ 单设备升级任务已创建并启动: ${taskId}`)

    ctx.body = {
      success: true,
      message: '升级命令已发送',
      taskId,
      sessionId
    }

  } catch (error) {
    ErrorLogger.logError('单设备升级失败', error, { deviceId: ctx.params.deviceId })
    ctx.status = 500
    ctx.body = {
      success: false,
      error: process.env.NODE_ENV === 'production' ? '升级失败' : error.message
    }
  }
}

/**
 * 单设备回滚 - 通过任务管理器记录
 */
async function rollbackDevice(ctx) {
  try {
    const { deviceId } = ctx.params
    const { project, sessionId } = ctx.request.body

    // 参数验证
    if (!project || !['frontend', 'backend'].includes(project)) {
      ctx.status = 400
      ctx.body = {
        success: false,
        error: '项目类型必须是 frontend 或 backend'
      }
      return
    }

    // 检查设备是否可以执行回滚操作
    const operationCheck = deviceManager.canPerformOperation(deviceId, 'rollback')
    if (!operationCheck.canPerform) {
      ctx.status = 409 // Conflict
      ctx.body = {
        success: false,
        error: operationCheck.reason
      }
      return
    }

    // 获取保存的白名单配置
    let preservedPaths = []
    try {
      preservedPaths = await getDevicePreservedPaths(deviceId, project)
      console.log(`🔍 获取设备 ${deviceId} 的 ${project} 白名单配置: ${JSON.stringify(preservedPaths)}`)

      // 安全检查：如果没有白名单配置，应该警告并停止回滚操作，防止删除所有文件
      if (!preservedPaths || preservedPaths.length === 0) {
        console.warn(`⚠️ 警告：设备 ${deviceId} 的 ${project} 没有白名单配置，回滚可能会删除所有文件！`)

        // 可以选择以下策略之一：
        // 1. 阻止回滚操作（推荐）
        ctx.status = 400
        ctx.body = {
          success: false,
          error: `回滚操作被阻止：设备缺少白名单配置，为防止数据丢失，请先设置白名单后再进行回滚操作`
        }
        return

        // 2. 或者使用默认的安全白名单（如果有定义的话）
        // preservedPaths = getDefaultPreservedPaths(project)
      }
    } catch (error) {
      console.warn(`获取设备 ${deviceId} 白名单配置失败:`, error.message)

      // 白名单配置获取失败时也应该阻止回滚
      ctx.status = 500
      ctx.body = {
        success: false,
        error: `回滚操作被阻止：无法获取设备白名单配置，为防止数据丢失，请检查设备配置后重试`
      }
      return
    }

    // 创建单设备回滚任务记录
    const batchTaskManager = await initializeBatchTaskManager()
    const taskId = await batchTaskManager.createRollbackTask({
      deviceIds: [deviceId],
      project,
      preservedPaths, // 传递白名单配置
      sessionId, // 传递会话ID以支持进度追踪
      creator: ctx.state.user?.username || 'system',
      scope: 'single'
    })

    // 异步执行回滚任务（不等待完成，立即返回）
    batchTaskManager.executeTask(taskId).catch(error => {
      ErrorLogger.logError('单设备回滚任务执行失败', error, { taskId, deviceId })
      console.error(`❌ 单设备回滚任务执行失败: ${taskId}`, error.message)
    })

    console.log(`✅ 单设备回滚任务已创建并启动: ${taskId}`)

    ctx.body = {
      success: true,
      message: '回滚命令已发送',
      taskId,
      sessionId
    }

  } catch (error) {
    ErrorLogger.logError('单设备回滚失败', error, { deviceId: ctx.params.deviceId })
    ctx.status = 500
    ctx.body = {
      success: false,
      error: process.env.NODE_ENV === 'production' ? '回滚失败' : error.message
    }
  }
}

export { getDevices, sendCommand, upgradeDevice, rollbackDevice }
