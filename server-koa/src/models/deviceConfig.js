// 中文注释：设备配置管理（兼容旧接口）
import { 
  setDeviceDeployPath as setPath,
  getDeviceDeployPath as getPath 
} from './deviceStorage.js';

/**
 * 设备配置管理（兼容旧接口）
 */
class DeviceConfig {
  constructor() {
    this.deployPathCache = new Map();
    this.initializeCache();
  }

  /**
   * 初始化缓存
   */
  async initializeCache() {
    // 这里可以预加载常用数据到缓存
  }

  /**
   * 获取设备的原部署目录路径配置 (异步版本)
   */
  async getDeviceDeployPath(deviceId) {
    try {
      const result = await getPath(deviceId);
      if (result) {
        this.deployPathCache.set(deviceId, result);
      }
      return result;
    } catch (error) {
      console.error('获取设备部署路径失败:', error);
      return null;
    }
  }

  /**
   * 设置设备的原部署目录路径配置
   */
  async setDeviceDeployPath(deviceId, deployPath) {
    if (!deviceId) {
      throw new Error('设备ID不能为空');
    }

    if (!deployPath) {
      throw new Error('原部署目录路径不能为空');
    }

    return await setPath(deviceId, deployPath);
  }

  /**
   * 删除设备配置
   */
  async removeDeviceConfig(deviceId) {
    if (this.config[deviceId]) {
      delete this.config[deviceId];
      await this.saveConfig();
      return true;
    }
    return false;
  }

  /**
   * 检查设备是否已配置原部署目录路径
   */
  isDeviceConfigured(deviceId) {
    return !!(this.config[deviceId] && this.config[deviceId].deployPath);
  }

  /**
   * 获取所有设备配置
   */
  getAllConfigs() {
    return { ...this.config };
  }
}

const deviceConfig = new DeviceConfig();

export default deviceConfig;