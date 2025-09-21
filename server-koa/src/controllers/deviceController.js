// 中文注释：ESM 导入
import deviceManager from '../models/deviceManager.js'
import { getDeviceDeployPaths, getAllDevices as getStoredDevices } from '../models/deviceStorage.js'

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
        wifiSignal: storedDevice.network?.wifiSignal || null,
        publicIp: storedDevice.network?.publicIp || null,
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
        upgradeHistory: storedDevice.upgradeHistory || []
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

    if (command === 'cmd:upgrade') {
      const { project } = payload
      if (!project || !['frontend', 'backend'].includes(project)) {
        ctx.status = 400
        ctx.body = {
          success: false,
          error: '升级命令需要有效的 project 参数 (frontend 或 backend)'
        }
        return
      }

      if (!payload.deployPath) {
        try {
          const deployPaths = await getDeviceDeployPaths(deviceId)
          if (deployPaths && deployPaths[project]) {
            payload.deployPath = deployPaths[project]
          }
        } catch (error) {
          console.warn(`读取设备 ${deviceId} 部署路径失败:`, error.message)
        }
      }
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

export { getDevices, sendCommand }
