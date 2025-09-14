// 中文注释：ESM 导入
import deviceManager from '../models/deviceManager.js';
import deviceConfig from '../models/deviceConfig.js';

/**
 * 获取设备列表（支持筛选和分页）
 */
async function getDevices(ctx) {
  const { 
    status,        // 状态筛选: all, online, offline, upgrading, error
    search,        // 搜索关键词: 设备名称或ID
    pageNum = 1,   // 页码
    pageSize = 20  // 每页数量
  } = ctx.query;
  
  try {
    let devices = deviceManager.getAllDevices();
    
    // 为每个设备添加配置信息
    let devicesWithConfig = await Promise.all(devices.map(async device => {
      const deployConfig = await deviceConfig.getDeviceDeployPath(device.deviceId);
      // 简单派生：近一次部署状态占位（与升级历史结合可后续完善）
      const lastDeployStatus = null; // 目前无升级聚合，这里保留占位
      const lastDeployAt = null;
      return {
        ...device,
        deploy: {
          deployPath: deployConfig ? deployConfig.deployPath : null,
          rollbackAvailable: typeof device.rollbackAvailable === 'boolean' ? device.rollbackAvailable : null,
          lastDeployStatus,
          lastDeployAt
        },
        hasDeployPath: !!deployConfig,
      };
    }));
    
    // 状态筛选
    if (status && status !== 'all') {
      devicesWithConfig = devicesWithConfig.filter(device => device.status === status);
    }
    
    // 搜索筛选（设备名称、设备ID或WiFi名称）
    if (search && search.trim()) {
      const searchTerm = search.trim().toLowerCase();
      devicesWithConfig = devicesWithConfig.filter(device => {
        const wifiName = device.network?.wifiName;
        return (
          device.deviceName.toLowerCase().includes(searchTerm) ||
          device.deviceId.toLowerCase().includes(searchTerm) ||
          (wifiName && wifiName.toLowerCase().includes(searchTerm))
        );
      });
    }
    
    const total = devicesWithConfig.length;
    
    // 分页处理
    const page = parseInt(pageNum);
    const size = parseInt(pageSize);
    const startIndex = (page - 1) * size;
    const endIndex = startIndex + size;
    const paginatedDevices = devicesWithConfig.slice(startIndex, endIndex);
    
    ctx.body = {
      success: true,
      devices: paginatedDevices,
      total: total,
      pageNum: page,
      pageSize: size,
      totalPages: Math.ceil(total / size),
      onlineCount: deviceManager.getOnlineDevices().length,
      filters: {
        status: status || 'all',
        search: search || ''
      }
    };
    
  } catch (error) {
    console.error('获取设备列表失败:', error);
    ctx.status = 500;
    ctx.body = {
      success: false,
      error: '获取设备列表失败'
    };
  }
}

/**
 * 获取设备详情
 */
async function getDeviceDetail(ctx) {
  const { deviceId } = ctx.params;
  
  try {
    const device = deviceManager.getDevice(deviceId);
    
    if (!device) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        error: '设备不存在'
      };
      return;
    }
    
    // 获取设备配置信息
    const deployConfig = await deviceConfig.getDeviceDeployPath(deviceId);
    
    ctx.body = {
      success: true,
      device: {
        deviceId,
        deviceName: device.info.deviceName,
        version: device.info.version,
        system: {
          platform: device.info.platform,
          osVersion: device.info.osVersion || null,
          arch: device.info.arch || null
        },
        agent: {
          agentVersion: device.info.agentVersion || null
        },
        network: {
          wifiName: device.info.network?.wifiName ?? null,
          wifiSignal: device.info.network?.wifiSignal ?? null,
          publicIp: device.info.network?.publicIp ?? null,
          localIp: device.info.network?.localIp ?? null,
          macAddresses: device.info.network?.macAddresses ?? []
        },
        storage: {
          diskFreeBytes: device.info.diskFreeBytes ?? null,
          writable: typeof device.info.writable === 'boolean' ? device.info.writable : null
        },
        deploy: {
          deployPath: deployConfig ? deployConfig.deployPath : null,
          rollbackAvailable: typeof device.info.rollbackAvailable === 'boolean' ? device.info.rollbackAvailable : null,
          lastDeployStatus: null,
          lastDeployAt: null
        },
        health: {
          uptimeSeconds: device.info.uptimeSeconds ?? null
        },
        status: device.status,
        connectedAt: device.connectedAt,
        disconnectedAt: device.disconnectedAt,
        lastHeartbeat: device.lastHeartbeat,
        hasDeployPath: !!deployConfig,
        info: device.info
      }
    };
    
  } catch (error) {
    console.error('获取设备详情失败:', error);
    ctx.status = 500;
    ctx.body = {
      success: false,
      error: '获取设备详情失败'
    };
  }
}

/**
 * 向设备发送命令
 */
async function sendCommand(ctx) {
  const { deviceId } = ctx.params;
  const { command, data } = ctx.request.body;
  
  if (!command) {
    ctx.status = 400;
    ctx.body = {
      success: false,
      error: '缺少 command 参数'
    };
    return;
  }
  
  try {
    const success = deviceManager.sendToDevice(deviceId, command, data);
    
    if (!success) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        error: '设备不在线或不存在'
      };
      return;
    }
    
    ctx.body = {
      success: true,
      message: '命令发送成功'
    };
    
  } catch (error) {
    console.error('发送命令失败:', error);
    ctx.status = 500;
    ctx.body = {
      success: false,
      error: '发送命令失败'
    };
  }
}

/**
 * 设置设备的原部署目录路径
 */
async function setDeployPath(ctx) {
  const { deviceId } = ctx.params;
  const { deployPath } = ctx.request.body;
  
  if (!deployPath) {
    ctx.status = 400;
    ctx.body = {
      success: false,
      error: '原部署目录路径不能为空'
    };
    return;
  }
  
  try {
    // 检查设备是否存在（不要求设备在线）
    const device = deviceManager.getDevice(deviceId);
    if (!device) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        error: '设备不存在'
      };
      return;
    }
    
    const config = await deviceConfig.setDeviceDeployPath(deviceId, deployPath);
    
    // 如果设备在线，实时通知设备端以便立刻检测 storage 并上报
    try {
      deviceManager.sendToDevice(deviceId, 'config:deploy-path', { deployPath });
    } catch (e) {
      // 忽略通知失败（设备可能离线），不影响接口成功
    }
    
    ctx.body = {
      success: true,
      message: '原部署目录路径设置成功',
      config: {
        deviceId,
        deployPath: config.deployPath,
        updatedAt: config.updatedAt,
        createdAt: config.createdAt
      }
    };
    
  } catch (error) {
    console.error('设置设备配置失败:', error);
    ctx.status = 500;
    ctx.body = {
      success: false,
      error: error.message || '设置设备配置失败'
    };
  }
}

/**
 * 获取设备配置
 */
async function getDeployPath(ctx) {
  const { deviceId } = ctx.params;
  
  try {
    const config = await deviceConfig.getDeviceDeployPath(deviceId);
    
    ctx.body = {
      success: true,
      config: config ? {
        deviceId,
        deployPath: config.deployPath,
        updatedAt: config.updatedAt,
        createdAt: config.createdAt
      } : null,
      hasConfig: !!config
    };
    
  } catch (error) {
    console.error('获取设备配置失败:', error);
    ctx.status = 500;
    ctx.body = {
      success: false,
      error: '获取设备配置失败'
    };
  }
}

export {
  getDevices,
  getDeviceDetail,
  sendCommand,
  setDeployPath,
  getDeployPath
};