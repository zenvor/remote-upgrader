// 设备注册管理器 - 专门负责设备注册和基本生命周期管理
import { ErrorLogger } from '../utils/common.js';

export class DeviceRegistry {
  constructor() {
    this.devices = new Map();
    this.socketToDevice = new Map();
    this.maxDevices = parseInt(process.env.MAX_DEVICES) || 1000;
  }

  /**
   * 注册新设备
   */
  registerDevice(socket, deviceInfo) {
    const deviceId = deviceInfo.deviceId;

    // 设备数量限制检查
    if (!this.devices.has(deviceId) && this.devices.size >= this.maxDevices) {
      ErrorLogger.logWarning('设备数量已达上限', `当前设备数: ${this.devices.size}`, { deviceId });
      this.cleanupLruDevice();
    }

    let deviceRecord = this.devices.get(deviceId);

    // 新设备注册
    if (!deviceRecord) {
      deviceRecord = {
        deviceId,
        socket,
        info: { ...deviceInfo },
        registeredAt: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      };
      this.devices.set(deviceId, deviceRecord);
      console.log(`✅ 新设备注册: ${deviceId} (${deviceInfo.deviceName})`);
    } else {
      // 现有设备重新连接
      deviceRecord.socket = socket;
      deviceRecord.info = { ...deviceRecord.info, ...deviceInfo };
      deviceRecord.lastActivity = new Date().toISOString();
      console.log(`🔄 设备重连: ${deviceId} (${deviceInfo.deviceName})`);
    }

    // 建立双向映射
    this.socketToDevice.set(socket.id, deviceId);

    return deviceRecord;
  }

  /**
   * 断开设备连接
   */
  disconnectDevice(socketId) {
    const deviceId = this.socketToDevice.get(socketId);
    if (!deviceId) return null;

    const deviceRecord = this.devices.get(deviceId);
    if (deviceRecord) {
      deviceRecord.socket = null;
      deviceRecord.disconnectedAt = new Date().toISOString();
      console.log(`❌ 设备断开连接: ${deviceId}`);
    }

    this.socketToDevice.delete(socketId);
    return deviceRecord;
  }

  /**
   * 获取设备信息
   */
  getDevice(deviceId) {
    return this.devices.get(deviceId);
  }

  /**
   * 获取所有在线设备
   */
  getOnlineDevices() {
    const onlineDevices = [];
    for (const [deviceId, device] of this.devices) {
      if (device.socket && device.socket.connected) {
        onlineDevices.push({
          deviceId,
          deviceName: device.info.deviceName,
          socket: device.socket,
          lastActivity: device.lastActivity
        });
      }
    }
    return onlineDevices;
  }

  /**
   * 获取所有设备
   */
  getAllDevices() {
    return Array.from(this.devices.values());
  }

  /**
   * 检查设备是否在线
   */
  isDeviceOnline(deviceId) {
    const device = this.devices.get(deviceId);
    return device && device.socket && device.socket.connected;
  }

  /**
   * 获取设备数量统计
   */
  getDeviceCount() {
    const total = this.devices.size;
    const online = this.getOnlineDevices().length;
    return { total, online };
  }

  /**
   * 清理最久未活动的设备 (LRU)
   */
  cleanupLruDevice() {
    let oldestDevice = null;
    let oldestTime = Date.now();

    for (const [deviceId, device] of this.devices) {
      const activityTime = new Date(device.lastActivity || device.registeredAt).getTime();
      if (activityTime < oldestTime) {
        oldestTime = activityTime;
        oldestDevice = deviceId;
      }
    }

    if (oldestDevice) {
      this.devices.delete(oldestDevice);
      ErrorLogger.logWarning('LRU设备清理', '已清理最久未活动设备', { deviceId: oldestDevice });
    }
  }

  /**
   * 更新设备活动时间
   */
  updateDeviceActivity(deviceId) {
    const device = this.devices.get(deviceId);
    if (device) {
      device.lastActivity = new Date().toISOString();
    }
  }
}