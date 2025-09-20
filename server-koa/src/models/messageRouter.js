// 消息路由器 - 专门负责设备间消息传递和通信
import { ErrorLogger } from '../utils/common.js'

export class MessageRouter {
  constructor(deviceRegistry) {
    this.deviceRegistry = deviceRegistry
    this.messageStats = {
      sent: 0,
      failed: 0,
      broadcast: 0
    }
  }

  /**
   * 发送消息到指定设备
   */
  sendToDevice(deviceId, event, data = {}) {
    const device = this.deviceRegistry.getDevice(deviceId)
    if (!device) {
      ErrorLogger.logWarning('消息发送失败', '设备不存在', { deviceId, event })
      this.messageStats.failed++
      return false
    }

    if (!device.socket || !device.socket.connected) {
      ErrorLogger.logWarning('消息发送失败', 'Socket未连接', { deviceId, event })
      this.messageStats.failed++
      return false
    }

    try {
      device.socket.emit(event, data)
      this.messageStats.sent++
      console.log(`📤 消息已发送到设备 ${deviceId}: ${event}`)
      return true
    } catch (error) {
      ErrorLogger.logError('消息发送异常', error, { deviceId, event })
      this.messageStats.failed++
      return false
    }
  }

  /**
   * 批量发送消息到多个设备
   */
  sendToDevices(deviceIds, event, data = {}) {
    const results = {
      success: [],
      failed: []
    }

    for (const deviceId of deviceIds) {
      if (this.sendToDevice(deviceId, event, data)) {
        results.success.push(deviceId)
      } else {
        results.failed.push(deviceId)
      }
    }

    console.log(`📤 批量消息发送完成: 成功 ${results.success.length}, 失败 ${results.failed.length}`)
    return results
  }

  /**
   * 广播消息到所有在线设备
   */
  broadcastToAll(event, data = {}) {
    const onlineDevices = this.deviceRegistry.getOnlineDevices()
    const deviceIds = onlineDevices.map((d) => d.deviceId)

    const results = this.sendToDevices(deviceIds, event, data)
    this.messageStats.broadcast++

    console.log(`📢 广播消息: ${event}, 覆盖设备 ${results.success.length}/${deviceIds.length}`)
    return results
  }

  /**
   * 发送命令到设备
   */
  sendCommand(deviceId, command, parameters = {}) {
    const commandData = {
      command,
      params: parameters,
      timestamp: new Date().toISOString(),
      messageId: this.generateMessageId()
    }

    return this.sendToDevice(deviceId, 'device:command', commandData)
  }

  /**
   * 批量发送命令
   */
  sendCommandToDevices(deviceIds, command, parameters = {}) {
    const commandData = {
      command,
      params: parameters,
      timestamp: new Date().toISOString(),
      messageId: this.generateMessageId()
    }

    return this.sendToDevices(deviceIds, 'device:command', commandData)
  }

  /**
   * 发送升级命令
   */
  sendUpgradeCommand(deviceId, upgradeInfo) {
    const upgradeData = {
      ...upgradeInfo,
      timestamp: new Date().toISOString(),
      messageId: this.generateMessageId()
    }

    return this.sendToDevice(deviceId, 'cmd:upgrade', upgradeData)
  }

  /**
   * 发送回滚命令
   */
  sendRollbackCommand(deviceId, rollbackInfo = {}) {
    const rollbackData = {
      ...rollbackInfo,
      timestamp: new Date().toISOString(),
      messageId: this.generateMessageId()
    }

    return this.sendToDevice(deviceId, 'cmd:rollback', rollbackData)
  }

  /**
   * 查询设备状态
   */
  queryDeviceStatus(deviceId) {
    const statusQuery = {
      timestamp: new Date().toISOString(),
      messageId: this.generateMessageId()
    }

    return this.sendToDevice(deviceId, 'cmd:status', statusQuery)
  }

  /**
   * 生成消息ID
   */
  generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  /**
   * 获取消息统计
   */
  getMessageStats() {
    return {
      ...this.messageStats,
      successRate: (this.messageStats.sent / (this.messageStats.sent + this.messageStats.failed)) * 100
    }
  }

  /**
   * 重置消息统计
   */
  resetMessageStats() {
    this.messageStats = {
      sent: 0,
      failed: 0,
      broadcast: 0
    }
  }

  /**
   * 测试设备连通性
   */
  async testDeviceConnectivity(deviceId) {
    const testMessage = {
      type: 'connectivity_test',
      timestamp: new Date().toISOString(),
      messageId: this.generateMessageId()
    }

    const success = this.sendToDevice(deviceId, 'test:ping', testMessage)
    console.log(`🏓 连通性测试: ${deviceId} - ${success ? '成功' : '失败'}`)

    return success
  }
}
