// 中文注释：设备配置管理

/**
 * 设备配置管理（兼容旧接口）
 */
class DeviceConfig {
  constructor() {
    this.initializeCache()
  }

  /**
   * 初始化缓存
   */
  async initializeCache() {
    // 这里可以预加载常用数据到缓存
  }

  /**
   * 删除设备配置
   */
  async removeDeviceConfig(deviceId) {
    if (this.config[deviceId]) {
      delete this.config[deviceId]
      await this.saveConfig()
      return true
    }

    return false
  }

  /**
   * 获取所有设备配置
   */
  getAllConfigs() {
    return { ...this.config }
  }
}

const deviceConfig = new DeviceConfig()

export default deviceConfig
