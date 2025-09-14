// 中文注释：ESM 导入
import deviceManager from '../models/deviceManager.js';
import deviceConfig from '../models/deviceConfig.js';

/**
 * Socket.IO 事件处理
 */
export function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`Socket 连接: ${socket.id}`);
    
    // 设备注册
    socket.on('device:register', async (data) => {
      try {
        // 直接按分组结构注册
        const device = deviceManager.registerDevice(socket, data);
        
        // 检查设备是否已配置原部署目录路径
        const deployConfig = await deviceConfig.getDeviceDeployPath(device.deviceId);
        const deployPath = deployConfig ? deployConfig.deployPath : null;
        
        socket.emit('device:registered', {
          success: true,
          deviceId: device.deviceId,
          message: '设备注册成功',
          deployPath: deployPath // 返回原部署目录路径，如果未配置则为 null
        });
        
        // 通知其他客户端有新设备上线
        socket.broadcast.emit('device:online', {
          deviceId: device.deviceId,
          deviceName: device.info.deviceName,
          connectedAt: device.connectedAt,
          hasDeployPath: !!deployPath // 标识是否已配置原部署目录路径
        });

        // 通知设备列表发生变更
        socket.broadcast.emit('device:list_changed', {
          action: 'add',
          deviceId: device.deviceId,
          deviceName: device.info.deviceName,
          total: deviceManager.getDeviceCount()
        });
        
      } catch (error) {
        console.error('设备注册失败:', error);
        socket.emit('device:registered', {
          success: false,
          error: error.message
        });
      }
    });
    
    // 设备心跳（可携带网络与系统信息的轻量更新）
    socket.on('device:heartbeat', (data) => {
      const deviceId = data.deviceId;
      if (deviceId) {
        // 可选网络刷新（接受顶层上报）
        const { wifiName, wifiSignal, publicIp, localIp, macAddresses } = data || {};
        if (wifiName !== undefined || wifiSignal !== undefined || publicIp !== undefined || localIp !== undefined || Array.isArray(macAddresses)) {
          deviceManager.updateNetworkInfo(deviceId, { wifiName, wifiSignal, publicIp, localIp, macAddresses });
        } else {
          deviceManager.updateHeartbeat(deviceId);
        }
        // 可选系统/健康轻量信息（按分组）
        if (data.health || data.system || data.agent || data.storage || data.deploy) {
          const payload = {
            agentVersion: data.agent?.agentVersion,
            osVersion: data.system?.osVersion,
            arch: data.system?.arch,
            type: data.system?.type,
            uptimeSeconds: data.health?.uptimeSeconds,
            diskFreeBytes: data.storage?.diskFreeBytes,
            writable: data.storage?.writable,
            rollbackAvailable: data.deploy?.rollbackAvailable
          };
          deviceManager.updateSystemInfo(deviceId, payload);
        }

        socket.emit('device:heartbeat_ack', { 
          timestamp: new Date().toISOString() 
        });
      }
    });
    
    // 设备状态更新
    socket.on('device:status', (data) => {
      const deviceId = data.deviceId;
      console.log(`设备状态更新: ${deviceId}`, data);
      
      // 广播设备状态变化
      socket.broadcast.emit('device:status_changed', data);
    });
    
    // 网络信息更新（包含 WiFi、公网/本地 IP、MAC）
    socket.on('device:update-network', (data) => {
      try {
        const { deviceId, network } = data;
        deviceManager.updateNetworkInfo(deviceId, network);

        // 广播网络信息变化到管理端
        socket.broadcast.emit('device:network_updated', {
          deviceId,
          network,
          timestamp: data.timestamp
        });
      } catch (error) {
        console.error('更新网络信息失败:', error);
      }
    });

    // 系统信息更新（agent 版本、OS、架构、磁盘、回滚可用等）
    socket.on('device:update-system', (data) => {
      try {
        const deviceId = data?.deviceId;
        if (deviceId) {
          const payload = {
            agentVersion: data.agent?.agentVersion,
            osVersion: data.system?.osVersion,
            arch: data.system?.arch,
            type: data.system?.type,
            uptimeSeconds: data.health?.uptimeSeconds,
            diskFreeBytes: data.storage?.diskFreeBytes,
            writable: data.storage?.writable,
            rollbackAvailable: data.deploy?.rollbackAvailable
          };
          deviceManager.updateSystemInfo(deviceId, payload);
          socket.broadcast.emit('device:system_updated', { deviceId, ...payload, timestamp: new Date().toISOString() });
        }
      } catch (error) {
        console.error('更新系统信息失败:', error);
      }
    });

    // WiFi信息更新（保留兼容性）
    socket.on('device:update-wifi', (data) => {
      try {
        const device = deviceManager.getDevice(data.deviceId);
        if (device) {
          // 更新设备WiFi信息到分组字段
          device.info.network = device.info.network || {};
          device.info.network.wifiName = data.wifiName;
          device.info.network.wifiSignal = data.wifiSignal;
          console.log(`WiFi信息更新: ${data.deviceId} (WiFi: ${data.wifiName})`);
        }
      } catch (error) {
        console.error('更新WiFi信息失败:', error);
      }
    });
    
    // 包分发相关事件
    socket.on('pkg:status', (data) => {
      console.log('包状态查询:', data);
      // 这里将来处理包分发状态查询
      socket.emit('pkg:status_response', {
        uploadId: data.uploadId,
        missingChunks: []
      });
    });
    
    socket.on('pkg:ack', (data) => {
      console.log('包分片确认:', data);
      // 处理分片确认
    });
    
    socket.on('pkg:verified', (data) => {
      console.log('包校验结果:', data);
      // 处理包校验结果
    });
    
    // 操作结果上报
    socket.on('op:result', (data) => {
      console.log('操作结果:', data);
      // 广播操作结果
      socket.broadcast.emit('operation:result', data);
    });
    
    // 设备断开连接
    socket.on('disconnect', () => {
      console.log(`Socket 断开: ${socket.id}`);
      const deviceId = deviceManager.socketToDevice?.get?.(socket.id);
      deviceManager.disconnectDevice(socket.id);
      
      // 如果找到设备ID，通知其他客户端设备离线
      if (deviceId) {
        socket.broadcast.emit('device:list_changed', {
          action: 'offline',
          deviceId: deviceId,
          total: deviceManager.getDeviceCount()
        });
      }
    });
    
    // 错误处理
    socket.on('error', (error) => {
      console.error(`Socket 错误 (${socket.id}):`, error);
    });
  });
}