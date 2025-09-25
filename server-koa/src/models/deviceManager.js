/**
 * 设备连接管理
 */
// 中文注释：设备管理（ESM 默认导出实例）
import {
  cleanupOfflineDevices,
  getAllDevices as getStoredDevices,
  recordDeviceDisconnection,
  recordDeviceUpgrade,
  saveDeviceInfo,
  updateDeviceConnectionStatus,
  updateDeviceCurrentVersion,
  updateDeviceDeployMetadata,
  updateDeviceHeartbeat,
  updateDeviceSystemInfo
} from './deviceStorage.js'

class DeviceManager {
  constructor() {
    this.devices = new Map() // DeviceId -> { socket, info, status }
    this.socketToDevice = new Map() // SocketId -> deviceId
    // 验证和限制最大设备数量
    const maxDevices = Number.parseInt(process.env.MAX_DEVICES) || 1000
    this.maxDevices = Math.min(Math.max(maxDevices, 1), 10000) // 限制在1-10000之间
    this.initializeFromStorage()
  }

  /**
   * 从持久化存储初始化设备信息
   */
  async initializeFromStorage() {
    try {
      const storedDevices = await getStoredDevices()
      for (const deviceData of storedDevices) {
        // 恢复设备信息但不恢复连接状态（因为服务器重启后连接都断开了）
        const infoFromStorage = { ...deviceData }
        this.devices.set(deviceData.deviceId, {
          deviceId: deviceData.deviceId,
          socket: null, // 重启后没有活跃连接
          info: infoFromStorage,
          status: 'offline', // 重启后所有设备都是离线状态
          connectedAt: null,
          lastHeartbeat: null,
          disconnectedAt: deviceData.status.lastHeartbeat
        })

        // 同步离线状态到存储
        if (deviceData.status.current === 'online') {
          // eslint-disable-next-line no-await-in-loop -- 需要顺序同步状态避免并发冲突
          await recordDeviceDisconnection(deviceData.deviceId)
        }
      }

      console.log(`从存储中恢复了 ${storedDevices.length} 个设备信息`)
    } catch (error) {
      console.error('从存储初始化设备信息失败:', error)
    }
  }

  /**
   * 注册设备
   */
  registerDevice(socket, deviceInfo) {
    // 验证输入数据
    if (!deviceInfo || typeof deviceInfo !== 'object') {
      throw new Error('无效的设备信息')
    }

    const {
      deviceId,
      deviceName,
      wifiName,
      wifiSignal,
      localIp,
      macAddresses,
      // 分组字段（优先）
      system = {},
      agent = {},
      network = {},
      deploy = {},
      health = {}
    } = deviceInfo

    if (!deviceId || typeof deviceId !== 'string' || deviceId.trim().length === 0) {
      throw new Error('设备ID必须是非空字符串')
    }

    // 限制设备ID长度
    if (deviceId.length > 100) {
      throw new Error('设备ID长度不能超过100个字符')
    }

    // 保存已存在设备的详细信息，以便在重连时合并
    let existingInfo = null
    if (this.devices.has(deviceId)) {
      const oldDevice = this.devices.get(deviceId)
      existingInfo = oldDevice.info
      if (oldDevice.socket && oldDevice.socket.id !== socket.id) {
        oldDevice.socket.disconnect()
      }
    }

    const device = {
      deviceId,
      socket,
      info: {
        deviceName: deviceName || deviceId,
        // 分组存储为首选数据结构，优先使用新数据，回退到已存在的数据
        system: {
          platform: system.platform || existingInfo?.system?.platform || 'unknown',
          osVersion: system.osVersion ?? existingInfo?.system?.osVersion ?? null,
          arch: system.arch ?? existingInfo?.system?.arch ?? null
        },
        agent: {
          agentVersion: agent.agentVersion ?? existingInfo?.agent?.agentVersion ?? null
        },
        network: {
          wifiName: network.wifiName ?? existingInfo?.network?.wifiName ?? null,
          wifiSignal: network.wifiSignal ?? existingInfo?.network?.wifiSignal ?? null,
          localIp: network.localIp ?? existingInfo?.network?.localIp ?? null,
          macAddresses: Array.isArray(network.macAddresses)
            ? network.macAddresses
            : existingInfo?.network?.macAddresses || [],
          lastKnownIp: existingInfo?.network?.lastKnownIp ?? null
        },
        deploy: {
          rollbackAvailable:
            typeof deploy.rollbackAvailable === 'boolean'
              ? deploy.rollbackAvailable
              : (existingInfo?.deploy?.rollbackAvailable ?? null)
        },
        health: {
          uptimeSeconds: health.uptimeSeconds ?? existingInfo?.health?.uptimeSeconds ?? null
        },
        // 保留其他有效的设备信息字段（排除状态和时间戳等非设备信息字段）
        ...(function (info) {
          const { ...validFields } = info
          return validFields
        })(deviceInfo)
      },
      status: 'online',
      connectedAt: new Date(),
      lastHeartbeat: new Date()
    }

    // 检查设备容量限制
    if (this.devices.size >= this.maxDevices && !this.devices.has(deviceId)) {
      this._enforceDeviceLimit()
    }

    this.devices.set(deviceId, device)
    this.socketToDevice.set(socket.id, deviceId)

    // 先保存设备信息到持久化存储，然后再记录连接事件
    this._saveDeviceInfoAndConnectionAsync(deviceId, device.info, {
      wifiName: network.wifiName || wifiName,
      wifiSignal: network.wifiSignal || wifiSignal,
      localIp: network.localIp || localIp,
      macAddresses: network.macAddresses || macAddresses
    })

    const finalWifiName = network.wifiName || wifiName
    const wifiInfo = finalWifiName ? ` (WiFi: ${finalWifiName})` : ' (无WiFi连接)'
    console.log(`设备注册成功: ${deviceId} (${device.info.deviceName})${wifiInfo}`)
    return device
  }

  /**
   * 设备断开连接
   */
  disconnectDevice(socketId) {
    const deviceId = this.socketToDevice.get(socketId)
    if (deviceId) {
      const device = this.devices.get(deviceId)
      if (device) {
        device.status = 'offline'
        device.disconnectedAt = new Date()

        // 记录断开连接事件
        this._recordDisconnectionAsync(deviceId)

        console.log(`设备断开连接: ${deviceId}`)
      }

      this.socketToDevice.delete(socketId)
    }
  }

  /**
   * 获取设备信息
   */
  getDevice(deviceId) {
    return this.devices.get(deviceId)
  }

  /**
   * 获取在线设备列表
   */
  getOnlineDevices() {
    const onlineDevices = []
    for (const [deviceId, device] of this.devices) {
      if (device.status === 'online') {
        onlineDevices.push({
          deviceId,
          deviceName: device.info.deviceName,
          system: {
            platform: device.info.system?.platform || 'unknown',
            osVersion: device.info.system?.osVersion ?? null,
            arch: device.info.system?.arch ?? null
          },
          agent: {
            agentVersion: device.info.agent?.agentVersion ?? null
          },
          network: {
            wifiName: device.info.network?.wifiName ?? null,
            wifiSignal: device.info.network?.wifiSignal ?? null,
            localIp: device.info.network?.localIp ?? null,
            macAddresses: device.info.network?.macAddresses ?? []
          },
          health: {
            uptimeSeconds: device.info.health?.uptimeSeconds ?? null
          },
          connectedAt: device.connectedAt,
          lastHeartbeat: device.lastHeartbeat
        })
      }
    }

    return onlineDevices
  }

  /**
   * 获取设备总数
   */
  getDeviceCount() {
    return this.devices.size
  }

  /**
   * 获取所有设备列表
   */
  getAllDevices() {
    const devices = []
    for (const [deviceId, device] of this.devices) {
      devices.push({
        deviceId,
        deviceName: device.info.deviceName,
        system: {
          platform: device.info.system?.platform || 'unknown',
          osVersion: device.info.system?.osVersion ?? null,
          arch: device.info.system?.arch ?? null
        },
        agent: {
          agentVersion: device.info.agent?.agentVersion ?? null
        },
        network: {
          wifiName: device.info.network?.wifiName ?? null,
          wifiSignal: device.info.network?.wifiSignal ?? null,
          localIp: device.info.network?.localIp ?? null,
          macAddresses: device.info.network?.macAddresses ?? []
        },
        health: {
          uptimeSeconds: device.info.health?.uptimeSeconds ?? null
        },
        status: device.status,
        connectedAt: device.connectedAt,
        disconnectedAt: device.disconnectedAt,
        lastHeartbeat: device.lastHeartbeat
      })
    }

    return devices
  }

  /**
   * 更新设备网络信息
   */
  updateNetworkInfo(deviceId, network) {
    const device = this.devices.get(deviceId)
    if (device) {
      const { wifiName, wifiSignal, localIp, macAddresses } = network
      device.info.network = device.info.network || {}
      if (wifiName !== undefined) device.info.network.wifiName = wifiName
      if (wifiSignal !== undefined) device.info.network.wifiSignal = wifiSignal

      if (localIp !== undefined) device.info.network.localIp = localIp || device.info.network.localIp || null
      if (Array.isArray(macAddresses)) device.info.network.macAddresses = macAddresses
      device.lastHeartbeat = new Date()
      console.log(`设备网络信息更新: ${deviceId} - WiFi: ${wifiName || '无'}, 本地IP: ${localIp || '未知'}`)
      // 将网络信息同步到持久化存储
      this._updateHeartbeatAsync(deviceId, {
        wifiName,
        wifiSignal,
        localIp,
        macAddresses
      })
    }
  }

  /**
   * 更新设备系统信息（agentVersion、osVersion、arch、uptimeSeconds、rollbackAvailable 等）
   */
  updateSystemInfo(deviceId, systemInfo = {}) {
    const device = this.devices.get(deviceId)
    if (!device) return
    // 更新分组字段为主
    const { agentVersion, osVersion, arch, uptimeSeconds, rollbackAvailable } = systemInfo

    device.info.system = device.info.system || {}
    if (osVersion !== undefined) device.info.system.osVersion = osVersion
    if (arch !== undefined) device.info.system.arch = arch
    if (device.info.system.platform == null && device.info.platform) {
      device.info.system.platform = device.info.platform
    }

    device.info.agent = device.info.agent || {}
    if (agentVersion !== undefined) device.info.agent.agentVersion = agentVersion


    device.info.deploy = device.info.deploy || {}
    if (rollbackAvailable !== undefined) device.info.deploy.rollbackAvailable = rollbackAvailable

    device.info.health = device.info.health || {}
    if (uptimeSeconds !== undefined) device.info.health.uptimeSeconds = uptimeSeconds

    const toSave = {
      system: {},
      agent: {},
      deploy: {},
      health: {}
    }
    if (osVersion !== undefined) toSave.system.osVersion = osVersion
    if (arch !== undefined) toSave.system.arch = arch
    if (agentVersion !== undefined) toSave.agent.agentVersion = agentVersion
    if (rollbackAvailable !== undefined) toSave.deploy.rollbackAvailable = rollbackAvailable
    if (uptimeSeconds !== undefined) toSave.health.uptimeSeconds = uptimeSeconds
    device.lastHeartbeat = new Date()
    // 持久化更新（仅包含改变的系统字段，按分组写入）
    this._updateSystemInfoAsync(deviceId, toSave).catch((error) => {
      console.error(`更新设备系统信息失败 [${deviceId}]:`, error.message)
    })
  }

  /**
   * 更新设备心跳
   */
  updateHeartbeat(deviceId) {
    const device = this.devices.get(deviceId)
    if (device) {
      device.lastHeartbeat = new Date()

      // 异步更新持久化存储中的心跳时间
      this._updateHeartbeatAsync(deviceId)
    }
  }

  /**
   * 向设备发送消息
   */
  sendToDevice(deviceId, event, data) {
    // 验证参数
    if (!deviceId || typeof deviceId !== 'string' || !event || typeof event !== 'string') {
      return false
    }

    const device = this.devices.get(deviceId)
    if (device && device.socket && device.status === 'online') {
      try {
        device.socket.emit(event, data)
        return true
      } catch (error) {
        console.error(`向设备发送消息失败 [${deviceId}]:`, error.message)
        return false
      }
    }

    return false
  }

  /**
   * 向多个设备发送消息
   */
  sendToDevices(deviceIds, event, data) {
    const results = {}
    for (const deviceId of deviceIds) {
      results[deviceId] = this.sendToDevice(deviceId, event, data)
    }

    return results
  }

  /**
   * 检查设备是否在线
   */
  isDeviceOnline(deviceId) {
    const device = this.devices.get(deviceId)
    return device && device.status === 'online'
  }

  /**
   * 发送命令并等待响应
   */
  async sendCommand(deviceId, command, parameters = {}, timeout = 30_000) {
    // 验证参数
    if (!deviceId || typeof deviceId !== 'string' || !command || typeof command !== 'string') {
      return {
        success: false,
        error: '无效的设备ID或命令'
      }
    }

    // 验证超时时间
    const validTimeout = Math.min(Math.max(Number(timeout) || 30_000, 1000), 300_000) // 1秒到5分钟之间

    const device = this.devices.get(deviceId)
    if (!device || !device.socket || device.status !== 'online') {
      return {
        success: false,
        error: '设备不在线或不存在'
      }
    }

    return new Promise((resolve) => {
      const messageId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
      const timeoutId = setTimeout(() => {
        // 清理监听器
        device.socket.off(`response:${messageId}`, responseHandler)
        resolve({
          success: false,
          error: '命令执行超时'
        })
      }, validTimeout)

      const responseHandler = (response) => {
        clearTimeout(timeoutId)
        resolve({
          success: true,
          data: response
        })
      }

      // 监听响应
      device.socket.once(`response:${messageId}`, responseHandler)

      // 发送命令
      const commandData = {
        command,
        params: parameters,
        messageId,
        timestamp: new Date().toISOString()
      }

      device.socket.emit('device:command', commandData)
    })
  }

  /**
   * 强制执行设备数量限制（LRU清理）
   */
  _enforceDeviceLimit() {
    const devicesArray = [...this.devices.entries()]
    // 按最后心跳时间排序，优先清理最久未活跃的设备
    devicesArray.sort((a, b) => {
      const aTime = a[1].lastHeartbeat || a[1].disconnectedAt || new Date(0)
      const bTime = b[1].lastHeartbeat || b[1].disconnectedAt || new Date(0)
      return aTime - bTime
    })

    // 清理最旧的设备直到低于限制
    const targetSize = Math.floor(this.maxDevices * 0.8) // 清理到80%容量
    let cleanedCount = 0

    for (let i = 0; i < devicesArray.length && this.devices.size > targetSize; i++) {
      const [deviceId, device] = devicesArray[i]
      if (device.status === 'offline') {
        this.devices.delete(deviceId)
        cleanedCount++
        console.log(`容量限制清理离线设备: ${deviceId}`)
      }
    }

    console.log(
      `执行设备容量限制清理，清理了 ${cleanedCount} 个设备，当前设备数: ${this.devices.size}/${this.maxDevices}`
    )
  }

  /**
   * 清理离线设备（超过1小时未心跳）
   */
  async cleanupOfflineDevices() {
    // 验证和限制心跳超时时间
    const heartbeatTimeout = Math.min(
      Math.max(Number.parseInt(process.env.HEARTBEAT_TIMEOUT) || 60_000, 30_000),
      3_600_000
    ) // 30秒到1小时之间
    const oneHourAgo = new Date(Date.now() - heartbeatTimeout * 60)
    let cleanedCount = 0

    for (const [deviceId, device] of this.devices) {
      if (device.status === 'offline' && device.disconnectedAt < oneHourAgo) {
        this.devices.delete(deviceId)
        cleanedCount++
        console.log(`清理离线设备: ${deviceId}`)
      }
    }

    // 同时清理持久化存储中的离线设备
    try {
      const storageCleanedCount = await cleanupOfflineDevices()
      console.log(`从存储中清理了 ${storageCleanedCount} 个长时间离线设备`)
    } catch (error) {
      console.error('清理存储中的离线设备失败:', error)
    }

    return cleanedCount
  }

  /**
   * 记录设备升级
   */
  async recordUpgrade(deviceId, upgradeInfo) {
    try {
      await recordDeviceUpgrade(deviceId, upgradeInfo)
      console.log(`记录设备升级: ${deviceId}`, upgradeInfo)
    } catch (error) {
      console.error('记录设备升级失败:', error)
    }
  }

  /**
   * 更新设备当前版本信息
   */
  async updateCurrentVersion(deviceId, project, versionInfo) {
    try {
      await updateDeviceCurrentVersion(deviceId, project, versionInfo)
      const device = this.devices.get(deviceId)
      if (device) {
        device.info.deploy = device.info.deploy || {}
        // 确保 frontend 和 backend 字段存在
        device.info.deploy.frontend = device.info.deploy.frontend || {
          version: null,
          deployDate: null,
          deployPath: null
        }
        device.info.deploy.backend = device.info.deploy.backend || {
          version: null,
          deployDate: null,
          deployPath: null
        }

        if (project && ['frontend', 'backend'].includes(project)) {
          const deployPath =
            typeof versionInfo.deployPath === 'string' ? versionInfo.deployPath.trim() : versionInfo.deployPath || null
          device.info.deploy[project] = {
            version: versionInfo.version || device.info.deploy[project]?.version || null,
            deployDate:
              versionInfo.deployDate || versionInfo.deployTime || device.info.deploy[project]?.deployDate || null,
            deployPath: deployPath || device.info.deploy[project]?.deployPath || null
          }
        }
      }

      console.log(`更新设备版本: ${deviceId} ${project}`, versionInfo)
    } catch (error) {
      console.error('更新设备版本失败:', error)
    }
  }

  async updateDeployMetadata(deviceId, project, metadata) {
    try {
      const normalizedMetadata = { ...metadata }
      if (typeof normalizedMetadata.deployPath === 'string') {
        normalizedMetadata.deployPath = normalizedMetadata.deployPath.trim()
      }

      await updateDeviceDeployMetadata(deviceId, project, normalizedMetadata)
      const device = this.devices.get(deviceId)
      if (device) {
        device.info.deploy = device.info.deploy || {}

        if (normalizedMetadata.status) {
          device.info.deploy.lastDeployStatus = normalizedMetadata.status
        }

        if (normalizedMetadata.deployAt) {
          device.info.deploy.lastDeployAt = normalizedMetadata.deployAt
        }

        if (normalizedMetadata.rollbackAt) {
          device.info.deploy.lastRollbackAt = normalizedMetadata.rollbackAt
        }
      }
    } catch (error) {
      console.error('更新设备部署信息失败:', error)
    }
  }

  /**
   * 更新设备当前部署路径（从 agent 通知）
   */
  async updateCurrentDeployPath(deviceId, project, deployPath, updatedAt, version = null) {
    try {
      const device = this.devices.get(deviceId)
      if (!device) {
        console.warn(`设备不存在: ${deviceId}`)
        return
      }

      const normalizedPath = typeof deployPath === 'string' ? deployPath.trim() : deployPath

      // 更新内存中的部署路径
      device.info.deploy = device.info.deploy || {}

      if (project && ['frontend', 'backend'].includes(project)) {
        // 更新对应项目的 deployPath
        device.info.deploy[project] = device.info.deploy[project] || {
          version: null,
          deployDate: null,
          deployPath: null
        }
        device.info.deploy[project].deployPath = normalizedPath
        // 如果提供了版本信息，同时更新版本
        if (version) {
          device.info.deploy[project].version = version
        }

        // 持久化到存储
        await this.updateCurrentVersion(deviceId, project, {
          deployPath: normalizedPath,
          deployDate: device.info.deploy[project].deployDate || updatedAt || new Date().toISOString(),
          version: version || device.info.deploy[project].version || 'unknown'
        })

        console.log(`更新设备当前部署路径: ${deviceId} ${project} -> ${normalizedPath}${version ? ` (版本: ${version})` : ''}`)
      }
    } catch (error) {
      console.error('更新设备当前部署路径失败:', error)
    }
  }

  /**
   * 更新设备部署路径信息
   */
  async updateDeployPath(deviceId, project, deployPath) {
    try {
      const device = this.devices.get(deviceId)
      if (!device) {
        console.warn(`设备不存在: ${deviceId}`)
        return
      }

      // 确保 deploy 结构符合新的配置格式
      device.info.deploy = device.info.deploy || {}
      device.info.deploy.currentDeployments = device.info.deploy.currentDeployments || {
        frontend: {
          version: 'unknown',
          deployDate: null,
          deployPath: null,
          status: 'unknown',
          lastOperationType: null,
          lastOperationDate: null
        },
        backend: {
          version: 'unknown',
          deployDate: null,
          deployPath: null,
          status: 'unknown',
          lastOperationType: null,
          lastOperationDate: null
        }
      }

      if (project && ['frontend', 'backend'].includes(project)) {
        const normalizedPath = typeof deployPath === 'string' ? deployPath.trim() : deployPath
        const updateTime = new Date().toISOString()

        // 更新内存中的数据
        device.info.deploy.currentDeployments[project].deployPath = normalizedPath
        device.info.deploy.currentDeployments[project].lastOperationType = 'path_update'
        device.info.deploy.currentDeployments[project].lastOperationDate = updateTime

        // 持久化到存储
        await this.updateCurrentVersion(deviceId, project, {
          deployPath: normalizedPath,
          deployDate: device.info.deploy.currentDeployments[project].deployDate || updateTime,
          version: device.info.deploy.currentDeployments[project].version || 'unknown'
        })

        console.log(`更新设备部署路径: ${deviceId} ${project} -> ${normalizedPath}`)
      }
    } catch (error) {
      console.error('更新设备部署路径失败:', error)
    }
  }

  // 私有异步辅助方法
  async _updateSystemInfoAsync(deviceId, systemInfo) {
    try {
      await updateDeviceSystemInfo(deviceId, systemInfo)
    } catch (error) {
      console.error('更新设备系统信息失败:', error)
    }
  }

  async _saveDeviceInfoAndConnectionAsync(deviceId, deviceInfo, network) {
    try {
      // 先保存设备信息（包含网络信息）
      await saveDeviceInfo(deviceId, deviceInfo, network)
      // 然后更新连接状态（简化版本，不记录历史）
      await updateDeviceConnectionStatus(deviceId, true)
    } catch (error) {
      console.error('保存设备信息和更新连接状态失败:', error)
    }
  }

  async _recordDisconnectionAsync(deviceId) {
    try {
      await recordDeviceDisconnection(deviceId)
    } catch (error) {
      console.error('记录设备断开连接失败:', error)
    }
  }

  async _updateHeartbeatAsync(deviceId, network) {
    try {
      await updateDeviceHeartbeat(deviceId, network)
    } catch (error) {
      console.error('更新设备心跳失败:', error)
    }
  }
}

const deviceManager = new DeviceManager()

// 定期清理和维护
setInterval(
  async () => {
    await deviceManager.cleanupOfflineDevices()
    // 检查内存容量，必要时强制清理
    if (deviceManager.devices.size > deviceManager.maxDevices * 0.9) {
      deviceManager._enforceDeviceLimit()
    }
  },
  Number.parseInt(process.env.CLEANUP_INTERVAL) || 1_800_000
) // 默认每30分钟清理一次

export default deviceManager
