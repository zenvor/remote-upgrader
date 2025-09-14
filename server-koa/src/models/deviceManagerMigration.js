// 设备管理器迁移工具 - 用于从旧版本平滑迁移到新架构
import DeviceManagerOld from './deviceManager.js';
import DeviceManagerNew from './deviceManagerNew.js';
import { ErrorLogger } from '../utils/common.js';

/**
 * 设备管理器代理 - 允许逐步迁移到新架构
 */
export class DeviceManagerProxy {
  constructor(useNewManager = false) {
    this.useNewManager = useNewManager;

    if (this.useNewManager) {
      this.manager = new DeviceManagerNew();
      console.log('🆕 使用新版设备管理器');
    } else {
      this.manager = new DeviceManagerOld();
      console.log('🔄 使用旧版设备管理器 (兼容模式)');
    }
  }

  // 代理所有方法到对应的管理器
  async initializeFromStorage() {
    return await this.manager.initializeFromStorage();
  }

  registerDevice(socket, deviceInfo) {
    return this.manager.registerDevice(socket, deviceInfo);
  }

  disconnectDevice(socketId) {
    return this.manager.disconnectDevice(socketId);
  }

  getDevice(deviceId) {
    return this.manager.getDevice(deviceId);
  }

  getOnlineDevices() {
    return this.manager.getOnlineDevices();
  }

  getDeviceCount() {
    return this.manager.getDeviceCount();
  }

  getAllDevices() {
    return this.manager.getAllDevices();
  }

  updateNetworkInfo(deviceId, network) {
    return this.manager.updateNetworkInfo(deviceId, network);
  }

  updateSystemInfo(deviceId, systemInfo) {
    return this.manager.updateSystemInfo(deviceId, systemInfo);
  }

  updateHeartbeat(deviceId, networkInfo) {
    return this.manager.updateHeartbeat(deviceId, networkInfo);
  }

  sendToDevice(deviceId, event, data) {
    return this.manager.sendToDevice(deviceId, event, data);
  }

  sendToDevices(deviceIds, event, data) {
    return this.manager.sendToDevices(deviceIds, event, data);
  }

  isDeviceOnline(deviceId) {
    return this.manager.isDeviceOnline(deviceId);
  }

  async cleanupOfflineDevices() {
    return await this.manager.cleanupOfflineDevices();
  }

  async recordUpgrade(deviceId, upgradeInfo) {
    return await this.manager.recordUpgrade(deviceId, upgradeInfo);
  }

  // 新管理器特有的方法（仅在新版本中可用）
  broadcastToAll(event, data) {
    if (this.useNewManager) {
      return this.manager.broadcastToAll(event, data);
    } else {
      ErrorLogger.logWarning('功能不可用', 'broadcastToAll 仅在新版管理器中可用');
      return { success: [], failed: [] };
    }
  }

  getSystemStats() {
    if (this.useNewManager) {
      return this.manager.getSystemStats();
    } else {
      // 为旧版本提供基本统计
      return {
        devices: this.manager.getDeviceCount(),
        timestamp: new Date().toISOString()
      };
    }
  }

  async performHealthCheck() {
    if (this.useNewManager) {
      return await this.manager.performHealthCheck();
    } else {
      console.log('🏥 基本健康检查 (旧版本)');
      return this.getSystemStats();
    }
  }

  async forceSync() {
    if (this.useNewManager) {
      return await this.manager.forceSync();
    } else {
      console.log('⚡ 强制同步 (旧版本无需操作)');
    }
  }
}

// 工厂函数 - 根据环境变量决定使用哪个版本
export function createDeviceManager() {
  const useNewManager = process.env.USE_NEW_DEVICE_MANAGER === 'true';

  console.log(`🏭 创建设备管理器 - ${useNewManager ? '新版本' : '旧版本'}`);

  return new DeviceManagerProxy(useNewManager);
}

export default createDeviceManager;