// 重构后的设备管理器 - 作为协调器，组合各个专门的管理器
import { ErrorLogger } from '../utils/common.js'
import { DeviceRegistry } from './deviceRegistry.js'
import { HeartbeatManager } from './heartbeatManager.js'
import { MessageRouter } from './messageRouter.js'
import { DeviceDataSync } from './deviceDataSync.js'
import { saveDeviceInfo } from './deviceStorage.js'

export default class DeviceManager {
  constructor() {
    // 初始化各个专门的管理器
    this.registry = new DeviceRegistry()
    this.heartbeat = new HeartbeatManager(this.registry)
    this.messageRouter = new MessageRouter(this.registry)
    this.dataSync = new DeviceDataSync(this.registry)

    console.log('🚀 设备管理器已启动 (重构版本)')
  }

  /**
   * 从存储中初始化设备信息
   */
  async initializeFromStorage() {
    try {
      // 这里可以加载已保存的设备信息到内存
      // 但由于设备注册是动态的，主要是恢复配置信息
      console.log('📦 设备管理器初始化完成')
    } catch (error) {
      ErrorLogger.logError('设备管理器初始化', error)
    }
  }

  // === 设备注册和连接管理 ===

  /**
   * 注册设备
   */
  registerDevice(socket, deviceInfo) {
    try {
      const deviceRecord = this.registry.registerDevice(socket, deviceInfo)

      // 异步保存到持久化存储
      this.dataSync.markForSync(deviceInfo.deviceId, 'registration', {
        deviceInfo,
        network: deviceInfo.network || {}
      })

      return deviceRecord
    } catch (error) {
      ErrorLogger.logError('设备注册', error, { deviceId: deviceInfo.deviceId })
      throw error
    }
  }

  /**
   * 设备断开连接
   */
  disconnectDevice(socketId) {
    const deviceRecord = this.registry.disconnectDevice(socketId)
    if (deviceRecord) {
      // 异步记录断开连接
      this.dataSync.markForSync(deviceRecord.deviceId, 'disconnection', {
        disconnectedAt: deviceRecord.disconnectedAt
      })
    }

    return deviceRecord
  }

  // === 信息更新方法 ===

  /**
   * 更新网络信息
   */
  async updateNetworkInfo(deviceId, networkInfo) {
    this.registry.updateDeviceActivity(deviceId)
    return await this.dataSync.updateNetworkInfo(deviceId, networkInfo)
  }

  /**
   * 更新系统信息
   */
  async updateSystemInfo(deviceId, systemInfo = {}) {
    this.registry.updateDeviceActivity(deviceId)
    return await this.dataSync.updateSystemInfo(deviceId, systemInfo)
  }

  /**
   * 更新心跳
   */
  updateHeartbeat(deviceId, networkInfo = {}) {
    this.registry.updateDeviceActivity(deviceId)
    return this.heartbeat.updateHeartbeat(deviceId, networkInfo)
  }

  // === 消息传递方法 ===

  /**
   * 发送消息到设备
   */
  sendToDevice(deviceId, event, data) {
    return this.messageRouter.sendToDevice(deviceId, event, data)
  }

  /**
   * 批量发送消息
   */
  sendToDevices(deviceIds, event, data) {
    return this.messageRouter.sendToDevices(deviceIds, event, data)
  }

  /**
   * 广播消息
   */
  broadcastToAll(event, data) {
    return this.messageRouter.broadcastToAll(event, data)
  }

  // === 设备查询方法 ===

  /**
   * 获取设备信息
   */
  getDevice(deviceId) {
    return this.registry.getDevice(deviceId)
  }

  /**
   * 获取在线设备列表
   */
  getOnlineDevices() {
    return this.registry.getOnlineDevices()
  }

  /**
   * 获取所有设备
   */
  getAllDevices() {
    return this.registry.getAllDevices().map((device) => ({
      deviceId: device.deviceId,
      deviceName: device.info.deviceName,
      status: this.isDeviceOnline(device.deviceId) ? 'online' : 'offline',
      lastActivity: device.lastActivity,
      info: device.info
    }))
  }

  /**
   * 检查设备是否在线
   */
  isDeviceOnline(deviceId) {
    return this.registry.isDeviceOnline(deviceId)
  }

  /**
   * 获取设备数量
   */
  getDeviceCount() {
    return this.registry.getDeviceCount()
  }

  // === 升级管理方法 ===

  /**
   * 记录升级信息
   */
  async recordUpgrade(deviceId, upgradeInfo) {
    return await this.dataSync.recordUpgrade(deviceId, upgradeInfo)
  }

  // === 清理和维护方法 ===

  /**
   * 清理离线设备
   */
  async cleanupOfflineDevices() {
    return await this.heartbeat.cleanupOfflineDevices()
  }

  // === 统计和监控方法 ===

  /**
   * 获取系统状态统计
   */
  getSystemStats() {
    const deviceStats = this.registry.getDeviceCount()
    const heartbeatStats = this.heartbeat.getHealthStats()
    const messageStats = this.messageRouter.getMessageStats()
    const syncStats = this.dataSync.getSyncStats()

    return {
      devices: deviceStats,
      health: heartbeatStats,
      messages: messageStats,
      sync: syncStats,
      timestamp: new Date().toISOString()
    }
  }

  /**
   * 执行健康检查
   */
  async performHealthCheck() {
    const stats = this.getSystemStats()

    console.log('🏥 系统健康检查:', {
      设备总数: stats.devices.total,
      在线设备: stats.devices.online,
      健康设备: stats.health.healthy,
      超时设备: stats.health.timedOut,
      消息成功率: `${stats.messages.successRate?.toFixed(1) || 0}%`,
      待同步更新: stats.sync.pendingUpdates
    })

    return stats
  }

  /**
   * 强制同步所有数据
   */
  async forceSync() {
    await this.dataSync.forceSync()
    console.log('⚡ 强制数据同步完成')
  }
}
