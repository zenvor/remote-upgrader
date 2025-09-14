// 修复配置文件脚本
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEVICES_CONFIG_PATH = path.join(__dirname, '../config/devices.json');

async function fixDevicesConfig() {
  try {
    console.log('开始修复 devices.json 配置...');
    
    // 读取当前配置
    const config = await fs.readJSON(DEVICES_CONFIG_PATH);
    
    // 修复 settings 中的0值问题
    config.settings = {
      ...config.settings,
      heartbeatTimeout: 60000,      // 1分钟心跳超时
      maxConnectionHistory: 20,     // 保存20条连接历史
      maxUpgradeHistory: 10,        // 保存10条升级历史
      autoCleanupOfflineDevices: false,  // 不自动清理
      offlineCleanupDays: 7         // 7天后清理
    };
    
    // 修复统计数据不一致问题
    const deviceCount = Object.keys(config.devices).length;
    let onlineCount = 0;
    
    // 计算实际在线设备数量
    for (const device of Object.values(config.devices)) {
      if (device.status && device.status.current === 'online') {
        onlineCount++;
      }
    }
    
    config.statistics = {
      ...config.statistics,
      totalDevices: deviceCount,
      onlineDevices: onlineCount,
      lastUpdated: new Date().toISOString()
    };
    
    // 清理 deviceInfo 中的冗余字段
    for (const [deviceId, deviceData] of Object.entries(config.devices)) {
      if (deviceData.deviceInfo) {
        // 移除冗余的网络相关字段
        delete deviceData.deviceInfo.wifiName;
        delete deviceData.deviceInfo.wifiSignal;
        delete deviceData.deviceInfo.publicIp;
        delete deviceData.deviceInfo.timestamp;
        delete deviceData.deviceInfo.status;
        
        // 确保必要字段存在
        if (!deviceData.deviceInfo.arch) {
          deviceData.deviceInfo.arch = 'unknown';
        }
        if (!deviceData.deviceInfo.type) {
          deviceData.deviceInfo.type = 'unknown';
        }
      }
    }
    
    // 保存修复后的配置
    await fs.writeJSON(DEVICES_CONFIG_PATH, config, { spaces: 2 });
    
    console.log('✅ devices.json 配置修复完成！');
    console.log(`- 设备总数: ${deviceCount}`);
    console.log(`- 在线设备: ${onlineCount}`);
    console.log(`- 心跳超时: ${config.settings.heartbeatTimeout}ms`);
    console.log(`- 连接历史上限: ${config.settings.maxConnectionHistory}`);
    
  } catch (error) {
    console.error('❌ 修复配置失败:', error);
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  fixDevicesConfig();
}

export { fixDevicesConfig };