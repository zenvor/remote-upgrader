// 心跳管理器 - 专门负责设备心跳和状态监控
import { ErrorLogger } from '../utils/common.js';

export class HeartbeatManager {
  constructor(deviceRegistry) {
    this.deviceRegistry = deviceRegistry;
    this.heartbeatTimeout = parseInt(process.env.HEARTBEAT_TIMEOUT) || 60000; // 1分钟
    this.cleanupInterval = parseInt(process.env.CLEANUP_INTERVAL) || 1800000; // 30分钟

    // 启动定期清理任务
    this.startCleanupTimer();
  }

  /**
   * 更新设备心跳
   */
  updateHeartbeat(deviceId, networkInfo = {}) {
    const device = this.deviceRegistry.getDevice(deviceId);
    if (!device) {
      ErrorLogger.logWarning('心跳更新失败', '设备不存在', { deviceId });
      return false;
    }

    // 更新设备活动时间
    this.deviceRegistry.updateDeviceActivity(deviceId);

    // 更新网络信息（如果提供）
    if (networkInfo && Object.keys(networkInfo).length > 0) {
      device.networkInfo = {
        ...device.networkInfo,
        ...networkInfo,
        lastUpdated: new Date().toISOString()
      };
    }

    device.lastHeartbeat = new Date().toISOString();
    return true;
  }

  /**
   * 检查设备是否超时
   */
  isDeviceTimedOut(device) {
    if (!device.lastHeartbeat) return false;

    const lastHeartbeatTime = new Date(device.lastHeartbeat).getTime();
    const now = Date.now();
    return (now - lastHeartbeatTime) > this.heartbeatTimeout;
  }

  /**
   * 获取超时设备列表
   */
  getTimedOutDevices() {
    const timedOutDevices = [];
    const allDevices = this.deviceRegistry.getAllDevices();

    for (const device of allDevices) {
      if (this.isDeviceTimedOut(device)) {
        timedOutDevices.push(device);
      }
    }

    return timedOutDevices;
  }

  /**
   * 清理离线设备
   */
  async cleanupOfflineDevices() {
    try {
      const timedOutDevices = this.getTimedOutDevices();
      let cleanupCount = 0;

      for (const device of timedOutDevices) {
        // 如果设备socket已断开且超时，标记为离线
        if (!device.socket || !device.socket.connected) {
          device.status = 'offline';
          device.offlineAt = new Date().toISOString();
          cleanupCount++;

          console.log(`⏰ 设备离线超时: ${device.deviceId}`);
        }
      }

      if (cleanupCount > 0) {
        console.log(`🧹 清理了 ${cleanupCount} 个超时离线设备`);
      }

      return cleanupCount;
    } catch (error) {
      ErrorLogger.logError('清理离线设备', error);
      return 0;
    }
  }

  /**
   * 启动定期清理定时器
   */
  startCleanupTimer() {
    setInterval(async () => {
      await this.cleanupOfflineDevices();
    }, this.cleanupInterval);

    console.log(`💗 心跳管理器启动，清理间隔: ${this.cleanupInterval / 1000}秒`);
  }

  /**
   * 获取设备健康状态统计
   */
  getHealthStats() {
    const allDevices = this.deviceRegistry.getAllDevices();
    const timedOutDevices = this.getTimedOutDevices();

    const stats = {
      total: allDevices.length,
      online: this.deviceRegistry.getOnlineDevices().length,
      timedOut: timedOutDevices.length,
      healthy: allDevices.length - timedOutDevices.length
    };

    return stats;
  }

  /**
   * 强制心跳检查
   */
  async forceHeartbeatCheck() {
    console.log('🔍 执行强制心跳检查...');
    const cleanupCount = await this.cleanupOfflineDevices();
    const stats = this.getHealthStats();

    console.log('📊 心跳检查结果:', stats);
    return { cleanupCount, stats };
  }
}