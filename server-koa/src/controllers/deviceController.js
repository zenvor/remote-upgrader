// 中文注释：ESM 导入
import deviceManager from '../models/deviceManager.js';
import deviceConfig from '../models/deviceConfig.js';
import { getAllDevices as getStoredDevices, getDeviceDeployPaths } from '../models/deviceStorage.js';

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
    // 获取内存中的设备状态信息（实时状态）
    const liveDevices = deviceManager.getAllDevices();

    // 获取存储中的完整设备信息（包括版本信息）
    const storedDevices = await getStoredDevices();

    // 合并实时状态和存储的完整信息
    let devicesWithConfig = storedDevices.map(storedDevice => {
      // 查找对应的实时设备状态
      const liveDevice = liveDevices.find(d => d.deviceId === storedDevice.deviceInfo.deviceId);

      // 提取部署信息，支持新的配置结构
      const deployInfo = storedDevice.deviceInfo?.deploy || {};

      // 兼容新旧配置结构
      let currentDeployments;
      if (deployInfo.currentDeployments) {
        // 新配置结构
        currentDeployments = deployInfo.currentDeployments;
      } else {
        // 兼容旧配置结构
        const currentVersions = deployInfo.currentVersions || {
          frontend: { version: null, deployDate: null, deployPath: null },
          backend: { version: null, deployDate: null, deployPath: null }
        };
        currentDeployments = {
          frontend: {
            version: currentVersions.frontend?.version || 'unknown',
            deployDate: currentVersions.frontend?.deployDate || null,
            deployPath: currentVersions.frontend?.deployPath || null,
            packageInfo: currentVersions.frontend?.packageInfo || null,
            status: 'unknown',
            lastOperationType: null,
            lastOperationDate: null
          },
          backend: {
            version: currentVersions.backend?.version || 'unknown',
            deployDate: currentVersions.backend?.deployDate || null,
            deployPath: currentVersions.backend?.deployPath || null,
            packageInfo: currentVersions.backend?.packageInfo || null,
            status: 'unknown',
            lastOperationType: null,
            lastOperationDate: null
          }
        };
      }

      // 格式化版本信息用于前端显示
      const versions = {
        frontend: currentDeployments.frontend?.version || '未部署',
        backend: currentDeployments.backend?.version || '未部署'
      };

      // 是否存在任一部署路径（由 currentDeployments 派生）
      const hasDeployPath = Boolean(
        currentDeployments.frontend?.deployPath || currentDeployments.backend?.deployPath
      );

      return {
        deviceId: storedDevice.deviceInfo.deviceId,
        deviceName: storedDevice.deviceInfo.deviceName || storedDevice.deviceInfo.deviceId,
        status: liveDevice?.status || 'offline', // 使用实时状态

        // 系统信息
        system: storedDevice.deviceInfo.system || {},
        agent: storedDevice.deviceInfo.agent || {},
        network: storedDevice.deviceInfo.network || {},
        storage: storedDevice.deviceInfo.storage || {},
        health: storedDevice.deviceInfo.health || {},

        // 版本信息（简化显示）
        versions,

        // 部署信息（新的配置结构）
        deploy: {
          capabilities: deployInfo.capabilities || {
            rollbackAvailable: deployInfo.rollbackAvailable || false,
            supportedProjects: ['frontend', 'backend']
          },
          currentDeployments,
          previousDeployments: deployInfo.previousDeployments || {
            frontend: { version: null, deployPath: null, packageInfo: null, rollbackDate: null },
            backend: { version: null, deployPath: null, packageInfo: null, rollbackDate: null }
          },
          deploymentHistory: deployInfo.deploymentHistory || [],
          lastDeployStatus: deployInfo.lastDeployStatus || null,
          lastDeployAt: deployInfo.lastDeployAt || null,
          lastRollbackAt: deployInfo.lastRollbackAt || null
        },
        hasDeployPath,

        // 连接信息（使用实时数据）
        connectedAt: liveDevice?.connectedAt || null,
        disconnectedAt: liveDevice?.disconnectedAt || null,
        lastHeartbeat: liveDevice?.lastHeartbeat || null,

        // WiFi信息（简化字段用于表格显示）
        wifiName: storedDevice.deviceInfo.network?.wifiName,
        wifiSignal: storedDevice.deviceInfo.network?.wifiSignal,
        publicIp: storedDevice.deviceInfo.network?.publicIp,

        // 升级历史
        upgradeHistory: storedDevice.upgradeHistory || []
      };
    });
    
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
    const payload = data && typeof data === 'object' ? { ...data } : {};

    if (command === 'cmd:upgrade') {
      const project = payload.project;
      if (!project || !['frontend', 'backend'].includes(project)) {
        ctx.status = 400;
        ctx.body = {
          success: false,
          error: '升级命令需要有效的 project 参数 (frontend 或 backend)'
        };
        return;
      }

      if (!payload.deployPath) {
        try {
          const deployPaths = await getDeviceDeployPaths(deviceId);
          if (deployPaths && deployPaths[project]) {
            payload.deployPath = deployPaths[project];
          }
        } catch (error) {
          console.warn(`读取设备 ${deviceId} 部署路径失败:`, error.message);
        }
      }
    }

    const success = deviceManager.sendToDevice(deviceId, command, payload);
    
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
      message: '命令发送成功',
      command,
      data: payload
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



export {
  getDevices,
  sendCommand
};
