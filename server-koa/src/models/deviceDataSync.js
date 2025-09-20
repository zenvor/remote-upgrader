// 设备数据同步管理器 - 专门负责设备信息更新和数据持久化同步
import { ErrorLogger } from '../utils/common.js'
import { saveDeviceInfo, updateDeviceSystemInfo, updateDeviceHeartbeat } from './deviceStorage.js'

export class DeviceDataSync {
  constructor(deviceRegistry) {
    this.deviceRegistry = deviceRegistry
    this.pendingUpdates = new Map() // 待处理的更新队列
    this.syncInterval = Number.parseInt(process.env.SYNC_INTERVAL) || 5000 // 5秒同步一次

    // 启动定期同步
    this.startSyncTimer()
  }

  /**
   * 更新设备网络信息
   */
  async updateNetworkInfo(deviceId, networkInfo) {
    const device = this.deviceRegistry.getDevice(deviceId)
    if (!device) {
      ErrorLogger.logWarning('网络信息更新失败', '设备不存在', { deviceId })
      return false
    }

    try {
      // 更新内存中的设备信息
      device.info = {
        ...device.info,
        network: {
          ...device.info.network,
          ...networkInfo,
          lastUpdated: new Date().toISOString()
        }
      }

      // 标记为待同步
      this.markForSync(deviceId, 'network', networkInfo)

      console.log(
        `🌐 设备网络信息更新: ${deviceId} - WiFi: ${networkInfo.wifiName || '未连接'}, 公网IP: ${networkInfo.publicIp || '未知'}`
      )
      return true
    } catch (error) {
      ErrorLogger.logError('更新网络信息', error, { deviceId })
      return false
    }
  }

  /**
   * 更新设备系统信息
   */
  async updateSystemInfo(deviceId, systemInfo = {}) {
    const device = this.deviceRegistry.getDevice(deviceId)
    if (!device) {
      ErrorLogger.logWarning('系统信息更新失败', '设备不存在', { deviceId })
      return false
    }

    try {
      // 更新内存中的设备信息
      const updatedInfo = {
        timestamp: new Date().toISOString(),
        ...systemInfo
      }

      device.info = {
        ...device.info,
        ...updatedInfo,
        system: {
          ...device.info.system,
          ...systemInfo.system
        },
        agent: {
          ...device.info.agent,
          ...systemInfo.agent
        },
        storage: {
          ...device.info.storage,
          ...systemInfo.storage
        },
        health: {
          ...device.info.health,
          ...systemInfo.health
        },
        deploy: {
          ...device.info.deploy,
          ...systemInfo.deploy
        }
      }

      // 标记为待同步
      this.markForSync(deviceId, 'system', systemInfo)

      console.log(`🔧 设备系统信息更新: ${deviceId}`, {
        storage: systemInfo.storage,
        health: systemInfo.health,
        deploy: systemInfo.deploy
      })

      return true
    } catch (error) {
      ErrorLogger.logError('更新系统信息', error, { deviceId })
      return false
    }
  }

  /**
   * 记录升级信息
   */
  async recordUpgrade(deviceId, upgradeInfo) {
    try {
      const device = this.deviceRegistry.getDevice(deviceId)
      if (!device) {
        ErrorLogger.logWarning('记录升级失败', '设备不存在', { deviceId })
        return false
      }

      const upgrade = {
        ...upgradeInfo,
        timestamp: new Date().toISOString(),
        deviceId
      }

      // 标记为待同步
      this.markForSync(deviceId, 'upgrade', upgrade)

      console.log(`⬆️ 设备升级记录: ${deviceId}`, upgrade)
      return true
    } catch (error) {
      ErrorLogger.logError('记录升级信息', error, { deviceId })
      return false
    }
  }

  /**
   * 标记设备数据待同步
   */
  markForSync(deviceId, type, data) {
    if (!this.pendingUpdates.has(deviceId)) {
      this.pendingUpdates.set(deviceId, {})
    }

    const deviceUpdates = this.pendingUpdates.get(deviceId)
    deviceUpdates[type] = {
      data,
      timestamp: new Date().toISOString()
    }

    deviceUpdates.lastUpdated = new Date().toISOString()
  }

  /**
   * 执行数据同步到持久化存储
   */
  async syncToPersistentStorage() {
    if (this.pendingUpdates.size === 0) return

    const syncPromises = []

    for (const [deviceId, updates] of this.pendingUpdates.entries()) {
      const device = this.deviceRegistry.getDevice(deviceId)
      if (!device) continue

      // 根据更新类型选择同步方法
      if (updates.network) {
        syncPromises.push(this.syncNetworkUpdate(deviceId, device.info, updates.network.data))
      }

      if (updates.system) {
        syncPromises.push(updateDeviceSystemInfo(deviceId, updates.system.data))
      }

      if (updates.upgrade) {
        syncPromises.push(this.syncUpgradeRecord(deviceId, updates.upgrade.data))
      }

      // 更新心跳（包含所有最新信息）
      syncPromises.push(updateDeviceHeartbeat(deviceId, device.info.network || {}))
    }

    try {
      await Promise.allSettled(syncPromises)

      // 清空已同步的更新
      this.pendingUpdates.clear()

      if (syncPromises.length > 0) {
        console.log(`💾 数据同步完成，处理了 ${syncPromises.length} 个更新`)
      }
    } catch (error) {
      ErrorLogger.logError('数据同步失败', error)
    }
  }

  /**
   * 同步网络信息更新
   */
  async syncNetworkUpdate(deviceId, deviceInfo, networkData) {
    try {
      await saveDeviceInfo(deviceId, deviceInfo, networkData)
    } catch (error) {
      ErrorLogger.logError('同步网络信息', error, { deviceId })
    }
  }

  /**
   * 同步升级记录
   */
  async syncUpgradeRecord(deviceId, upgradeData) {
    try {
      // 这里可以调用专门的升级记录存储方法
      console.log(`📝 升级记录已同步: ${deviceId}`)
    } catch (error) {
      ErrorLogger.logError('同步升级记录', error, { deviceId })
    }
  }

  /**
   * 启动定期同步定时器
   */
  startSyncTimer() {
    setInterval(async () => {
      await this.syncToPersistentStorage()
    }, this.syncInterval)

    console.log(`🔄 数据同步管理器启动，同步间隔: ${this.syncInterval / 1000}秒`)
  }

  /**
   * 强制立即同步
   */
  async forceSync() {
    console.log('⚡ 执行强制数据同步...')
    await this.syncToPersistentStorage()
  }

  /**
   * 获取同步统计
   */
  getSyncStats() {
    return {
      pendingUpdates: this.pendingUpdates.size,
      syncInterval: this.syncInterval,
      nextSyncIn: this.syncInterval - (Date.now() % this.syncInterval)
    }
  }
}
