// 中文注释：设备信息持久化存储模块
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'fs-extra'
import { ErrorLogger, FileHelper, DateHelper } from '../utils/common.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DEVICES_CONFIG_PATH = path.join(__dirname, '../../config/devices.json')

// 简单的保存队列，串行化对 devices.json 的写入，避免并发写导致文件损坏
let lastSavePromise = Promise.resolve()

/**
 * 原子写入 JSON：先写入同目录临时文件，再原子重命名覆盖
 */
async function atomicWriteJson(filePath, data, spaces = 2) {
  const temporaryPath = `${filePath}.tmp-${Date.now()}`
  await fs.outputJSON(temporaryPath, data, { spaces })
  await fs.move(temporaryPath, filePath, { overwrite: true })
}

/**
 * 创建默认设备配置结构
 */
function createDefaultConfig() {
  return {
    devices: {},
    settings: {
      heartbeatTimeout: Number.parseInt(process.env.HEARTBEAT_TIMEOUT) || 60_000, // 心跳超时
      maxUpgradeHistory: Number.parseInt(process.env.MAX_UPGRADE_HISTORY) || 10, // 保存升级历史数
      offlineCleanupDays: Number.parseInt(process.env.OFFLINE_CLEANUP_DAYS) || 7 // 清理离线设备天数
    },
    statistics: {
      totalDevices: 0,
      onlineDevices: 0,
      totalConnections: 0,
      lastUpdated: DateHelper.getCurrentDate()
    }
  }
}

/**
 * 处理损坏的配置文件
 */
async function handleCorruptedConfig(parseError) {
  ErrorLogger.logWarning('devices.json 解析', '尝试自动修复: ' + parseError.message)

  // 备份损坏的配置文件
  const backupPath = `${DEVICES_CONFIG_PATH}.bak-${Date.now()}`
  try {
    await fs.move(DEVICES_CONFIG_PATH, backupPath, { overwrite: true })
    console.warn('✅ 已备份损坏的配置文件到:', backupPath)
  } catch (error) {
    ErrorLogger.logWarning('备份损坏配置文件', error.message)
  }

  // 重建默认配置
  const defaultConfig = createDefaultConfig()
  await fs.writeJSON(DEVICES_CONFIG_PATH, defaultConfig, { spaces: 2 })
  return defaultConfig
}

/**
 * 获取设备存储配置
 */
export async function getDevicesConfig() {
  try {
    if (await FileHelper.safePathExists(DEVICES_CONFIG_PATH)) {
      try {
        const config = await fs.readJSON(DEVICES_CONFIG_PATH)
        return config
      } catch (error) {
        return await handleCorruptedConfig(error)
      }
    }

    // 创建默认配置
    const defaultConfig = createDefaultConfig()
    await fs.writeJSON(DEVICES_CONFIG_PATH, defaultConfig, { spaces: 2 })
    return defaultConfig
  } catch (error) {
    ErrorLogger.logError('获取设备配置', error)
    throw error
  }
}

/**
 * 保存设备配置
 */
export async function saveDevicesConfig(config) {
  // 串行化保存，避免并发写
  lastSavePromise = lastSavePromise.then(async () => {
    try {
      config.statistics.lastUpdated = DateHelper.getCurrentDate()
      await atomicWriteJson(DEVICES_CONFIG_PATH, config, 2)
      return config
    } catch (error) {
      console.error('保存设备配置失败:', error)
      throw error
    }
  })
  return lastSavePromise
}

/**
 * 添加或更新设备信息
 */
export async function saveDeviceInfo(deviceId, deviceInfo, network = {}) {
  try {
    const config = await getDevicesConfig()

    if (config.devices[deviceId]) {
      // 更新现有设备
      const device = config.devices[deviceId]

      // 更新设备基本信息（支持新的扁平结构）
      Object.assign(device, deviceInfo)

      // 更新网络信息（统一使用扁平结构）
      device.network = {
        wifiName: device.network?.wifiName ?? null,
        wifiSignal: device.network?.wifiSignal ?? null,
        publicIp: device.network?.publicIp ?? null,
        localIp: device.network?.localIp ?? null,
        macAddresses: Array.isArray(device.network?.macAddresses)
          ? device.network.macAddresses
          : [],
        ...network
      }
    } else {
      // 新设备
      config.devices[deviceId] = {
        deviceId,
        deviceName: deviceInfo?.deviceName || deviceId,
        system: {
          platform: deviceInfo?.system?.platform || deviceInfo?.platform || 'unknown',
          osVersion: deviceInfo?.system?.osVersion ?? deviceInfo?.osVersion ?? null,
          arch: deviceInfo?.system?.arch ?? deviceInfo?.arch ?? null
        },
        agent: {
          agentVersion: deviceInfo?.agent?.agentVersion ?? deviceInfo?.agentVersion ?? null
        },
        network: {
          wifiName: network?.wifiName ?? deviceInfo?.network?.wifiName ?? null,
          wifiSignal: network?.wifiSignal ?? deviceInfo?.network?.wifiSignal ?? null,
          publicIp: network?.publicIp ?? deviceInfo?.network?.publicIp ?? null,
          localIp: network?.localIp ?? deviceInfo?.network?.localIp ?? null,
          macAddresses: Array.isArray(network?.macAddresses)
            ? network.macAddresses
            : deviceInfo?.network?.macAddresses || []
        },
        storage: {
          diskFreeBytes: deviceInfo?.storage?.diskFreeBytes ?? deviceInfo?.diskFreeBytes ?? null,
          writable:
            typeof (deviceInfo?.storage?.writable ?? deviceInfo?.writable) === 'boolean'
              ? (deviceInfo?.storage?.writable ?? deviceInfo?.writable)
              : null
        },
        deploy: {
          rollbackAvailable:
            typeof (deviceInfo?.deploy?.rollbackAvailable ?? deviceInfo?.rollbackAvailable) === 'boolean'
              ? (deviceInfo?.deploy?.rollbackAvailable ?? deviceInfo?.rollbackAvailable)
              : null
        },
        health: {
          uptimeSeconds: deviceInfo?.health?.uptimeSeconds ?? deviceInfo?.uptimeSeconds ?? null
        },
        upgradeHistory: [],
        status: {
          current: 'offline',
          lastHeartbeat: null
        }
      }

      config.statistics.totalDevices = Object.keys(config.devices).length
    }

    return await saveDevicesConfig(config)
  } catch (error) {
    console.error('保存设备信息失败:', error)
    throw error
  }
}

/**
 * 更新设备连接状态（简化版本，不记录历史）
 */
export async function updateDeviceConnectionStatus(deviceId, isOnline = true) {
  try {
    const config = await getDevicesConfig()
    const now = DateHelper.getCurrentDate()

    if (!config.devices[deviceId]) {
      console.warn(`尝试更新连接状态但设备不存在: ${deviceId}`)
      return config
    }

    const device = config.devices[deviceId]
    const wasOnline = device.status.current === 'online'

    // 更新状态
    device.status.current = isOnline ? 'online' : 'offline'
    if (isOnline) {
      device.status.lastHeartbeat = now
    }

    // 更新统计
    if (isOnline && !wasOnline) {
      config.statistics.onlineDevices = Math.max(0, (config.statistics.onlineDevices || 0) + 1)
      config.statistics.totalConnections++
    } else if (!isOnline && wasOnline) {
      config.statistics.onlineDevices = Math.max(0, (config.statistics.onlineDevices || 0) - 1)
    }

    return await saveDevicesConfig(config)
  } catch (error) {
    console.error('更新设备连接状态失败:', error)
    throw error
  }
}

/**
 * 记录设备断开连接
 */
export async function recordDeviceDisconnection(deviceId) {
  try {
    const config = await getDevicesConfig()
    const now = DateHelper.getCurrentDate()

    if (!config.devices[deviceId]) {
      return config // 设备不存在，直接返回
    }

    const device = config.devices[deviceId]
    const wasOnline = device.status.current === 'online'

    // 更新状态
    device.status.current = 'offline'
    device.status.lastHeartbeat = now

    // 更新统计
    if (wasOnline && config.statistics.onlineDevices > 0) {
      config.statistics.onlineDevices--
    }

    return await saveDevicesConfig(config)
  } catch (error) {
    console.error('记录设备断开连接失败:', error)
    throw error
  }
}

/**
 * 更新设备心跳
 */
export async function updateDeviceHeartbeat(deviceId, network = {}) {
  try {
    const config = await getDevicesConfig()
    const now = DateHelper.getCurrentDate()

    if (!config.devices[deviceId]) {
      return config // 设备不存在，直接返回
    }

    const device = config.devices[deviceId]
    device.status.lastHeartbeat = now

    // 确保分组字段结构存在（但不覆盖已有数据）
    device.system = device.system || {}
    device.agent = device.agent || {}
    device.storage = device.storage || {}
    device.deploy = device.deploy || {}
    device.health = device.health || {}

    // 更新网络信息（如果提供）
    device.network = device.network || {
      wifiName: null,
      wifiSignal: null,
      publicIp: null,
      localIp: null,
      macAddresses: []
    }
    if (network.wifiName !== undefined) {
      device.network.wifiName = network.wifiName
    }

    if (network.wifiSignal !== undefined) {
      device.network.wifiSignal = network.wifiSignal
    }

    if (network.publicIp !== undefined) {
      device.network.publicIp = network.publicIp
      // 同步最后一次已知公网 IP
      device.network.lastKnownIp = network.publicIp
    }

    if (network.localIp !== undefined) {
      device.network.localIp = network.localIp
    }

    if (Array.isArray(network.macAddresses)) {
      device.network.macAddresses = network.macAddresses
    }

    return await saveDevicesConfig(config)
  } catch (error) {
    console.error('更新设备心跳失败:', error)
    throw error
  }
}

/**
 * 更新设备系统信息（分组字段）
 */
export async function updateDeviceSystemInfo(deviceId, systemInfo = {}) {
  try {
    const config = await getDevicesConfig()

    if (!config.devices[deviceId]) {
      return config // 设备不存在，直接返回
    }

    const device = config.devices[deviceId]

    // 确保分组字段结构存在
    device.system = device.system || {}
    device.agent = device.agent || {}
    device.storage = device.storage || {}
    device.deploy = device.deploy || {}
    device.health = device.health || {}

    // 更新系统信息（只更新提供的字段）
    if (systemInfo.system) {
      Object.assign(device.system, systemInfo.system)
    }

    if (systemInfo.agent) {
      Object.assign(device.agent, systemInfo.agent)
    }

    if (systemInfo.storage) {
      Object.assign(device.storage, systemInfo.storage)
    }

    if (systemInfo.deploy) {
      Object.assign(device.deploy, systemInfo.deploy)
    }

    if (systemInfo.health) {
      Object.assign(device.health, systemInfo.health)
    }

    return await saveDevicesConfig(config)
  } catch (error) {
    console.error('更新设备系统信息失败:', error)
    throw error
  }
}

/**
 * 记录设备升级
 */
export async function recordDeviceUpgrade(deviceId, upgradeInfo) {
  try {
    const config = await getDevicesConfig()
    const now = DateHelper.getCurrentDate()

    if (!config.devices[deviceId]) {
      throw new Error(`设备不存在: ${deviceId}`)
    }

    const device = config.devices[deviceId]

    const upgrade = {
      upgradeId: upgradeInfo.upgradeId || `upgrade-${Date.now()}`,
      project: upgradeInfo.project,
      packageName: upgradeInfo.packageName,
      fromVersion: upgradeInfo.fromVersion || 'unknown',
      toVersion: upgradeInfo.toVersion,
      status: upgradeInfo.status || 'started',
      startedAt: upgradeInfo.startedAt || now,
      completedAt: upgradeInfo.completedAt || null,
      duration: upgradeInfo.duration || null,
      error: upgradeInfo.error || null
    }

    device.upgradeHistory.unshift(upgrade)

    // 限制历史记录数量
    if (device.upgradeHistory.length > config.settings.maxUpgradeHistory) {
      device.upgradeHistory = device.upgradeHistory.slice(0, config.settings.maxUpgradeHistory)
    }

    // 如果升级成功，更新当前版本信息
    if (upgradeInfo.status === 'completed' && upgradeInfo.versionInfo) {
      await updateDeviceCurrentVersion(deviceId, upgradeInfo.project, upgradeInfo.versionInfo)
    }

    return await saveDevicesConfig(config)
  } catch (error) {
    console.error('记录设备升级失败:', error)
    throw error
  }
}

/**
 * 更新设备当前版本信息
 */
export async function updateDeviceCurrentVersion(deviceId, project, versionInfo) {
  try {
    const config = await getDevicesConfig()
    const now = DateHelper.getCurrentDate()

    if (!config.devices[deviceId]) {
      throw new Error(`设备不存在: ${deviceId}`)
    }

    const device = config.devices[deviceId]

    // 确保 deploy 字段存在
    if (!device.deploy) {
      device.deploy = { rollbackAvailable: false }
    }

    const deployObj = device.deploy

    // 确保 frontend 和 backend 字段存在
    if (!deployObj.frontend) {
      deployObj.frontend = {
        version: null,
        deployDate: null,
        deployPath: null
      }
    }

    if (!deployObj.backend) {
      deployObj.backend = {
        version: null,
        deployDate: null,
        deployPath: null
      }
    }


    // 更新指定项目的版本信息
    if (project && ['frontend', 'backend'].includes(project)) {
      const existingRecord = deployObj[project] || {}
      const deployPath =
        typeof versionInfo.deployPath === 'string' ? versionInfo.deployPath.trim() : versionInfo.deployPath || null

      deployObj[project] = {
        version: versionInfo.version || existingRecord.version || null,
        deployDate: versionInfo.deployDate || versionInfo.deployTime || existingRecord.deployDate || now,
        deployPath: deployPath || existingRecord.deployPath || null
      }

    }

    return await saveDevicesConfig(config)
  } catch (error) {
    console.error('更新设备当前版本失败:', error)
    throw error
  }
}

/**
 * 更新部署元信息（部署路径、状态等）
 */
export async function updateDeviceDeployMetadata(deviceId, project, metadata = {}) {
  try {
    const config = await getDevicesConfig()

    if (!config.devices[deviceId]) {
      throw new Error(`设备不存在: ${deviceId}`)
    }

    const device = config.devices[deviceId]
    device.deploy = device.deploy || {}

    if (project && ['frontend', 'backend'].includes(project)) {
      const deployPath = typeof metadata.deployPath === 'string' ? metadata.deployPath.trim() : metadata.deployPath

      if (deployPath) {
        device.deploy[project] = device.deploy[project] || {}
        device.deploy[project].deployPath = deployPath
      }
    }

    if (metadata.status) {
      device.deploy.lastDeployStatus = metadata.status
    }

    if (metadata.deployAt) {
      device.deploy.lastDeployAt = metadata.deployAt
    }

    if (metadata.rollbackAt) {
      device.deploy.lastRollbackAt = metadata.rollbackAt
    }

    return await saveDevicesConfig(config)
  } catch (error) {
    console.error('更新设备部署信息失败:', error)
    throw error
  }
}

/**
 * 获取设备的部署路径（当前记录）
 */
export async function getDeviceDeployPaths(deviceId) {
  try {
    const config = await getDevicesConfig()
    const device = config.devices[deviceId]
    if (!device) {
      return { frontend: null, backend: null }
    }

    return {
      frontend: device.deploy?.frontend?.deployPath || null,
      backend: device.deploy?.backend?.deployPath || null
    }
  } catch (error) {
    console.error('获取设备部署路径失败:', error)
    throw error
  }
}

/**
 * 获取所有设备信息
 */
export async function getAllDevices() {
  try {
    const config = await getDevicesConfig()
    return Object.values(config.devices)
  } catch (error) {
    console.error('获取所有设备失败:', error)
    throw error
  }
}

/**
 * 获取设备详细信息
 */
export async function getDeviceById(deviceId) {
  try {
    const config = await getDevicesConfig()
    return config.devices[deviceId] || null
  } catch (error) {
    console.error('获取设备详细信息失败:', error)
    throw error
  }
}

/**
 * 清理长时间离线的设备
 */
export async function cleanupOfflineDevices() {
  try {
    const config = await getDevicesConfig()
    const daysAgo = new Date(Date.now() - config.settings.offlineCleanupDays * 24 * 60 * 60 * 1000)

    let cleanedCount = 0

    for (const [deviceId, device] of Object.entries(config.devices)) {
      if (
        device.status.current === 'offline' &&
        device.status.lastHeartbeat &&
        new Date(device.status.lastHeartbeat) < daysAgo
      ) {
        delete config.devices[deviceId]
        cleanedCount++
        console.log(`清理长时间离线设备: ${deviceId}`)
      }
    }

    if (cleanedCount > 0) {
      config.statistics.totalDevices = Object.keys(config.devices).length
      await saveDevicesConfig(config)
    }

    return cleanedCount
  } catch (error) {
    console.error('清理离线设备失败:', error)
    throw error
  }
}
