// 中文注释：Socket 事件处理器（ESM 默认导出）
import { ErrorLogger } from '../utils/common.js';

export default class SocketHandler {
  constructor(socket, agent) {
    this.socket = socket;
    this.agent = agent;
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    // 设备注册响应
    this.socket.on('device:registered', (data) => {
      this.handleDeviceRegistered(data);
    });
    
    // 接收服务端命令
    this.socket.on('device:command', (data) => {
      this.handleCommand(data);
    });
    
    // 升级命令
    this.socket.on('cmd:upgrade', (data) => {
      this.handleUpgradeCommand(data);
    });
    
    // 降级命令
    this.socket.on('cmd:rollback', (data) => {
      this.handleRollbackCommand(data);
    });
    
    // 状态查询命令
    this.socket.on('cmd:status', (data) => {
      this.handleStatusCommand(data);
    });
    
    // 心跳响应
    this.socket.on('device:heartbeat_ack', (data) => {
      this.handleHeartbeatPong(data);
    });
    
    // 服务端配置推送：deployPath 更新后立刻触发一次 storage 检测并上报
    this.socket.on('config:deploy-path', (data) => {
      if (data && data.deployPath) {
        this.agent.updateSystemInfoAfterRegistration(data.deployPath).catch(error => {
          ErrorLogger.logError('配置部署路径后更新系统信息', error, { deployPath: data.deployPath });
        });
      }
    });

    // 服务端触发的即时网络刷新：收到后立刻执行一次网络信息采集与上报
    this.socket.on('config:refresh-network', () => {
      this.agent.updateNetworkInfo().catch(error => {
        ErrorLogger.logError('刷新网络信息', error);
      });
    });
    
    // 开始心跳
    this.startHeartbeat();
  }
  
  handleDeviceRegistered(data) {
    console.log('设备注册成功:', data);
    this.agent.reportStatus('registered');
    // 如果服务端回传了 deployPath，尽快上报存储与回滚能力
    if (data && data.deployPath) {
      this.agent.updateSystemInfoAfterRegistration(data.deployPath).catch(error => {
        ErrorLogger.logError('注册后更新系统信息', error, { deployPath: data.deployPath });
      });
    }
  }
  
  async handleCommand(data) {
    console.log('收到服务端命令:', data);
    
    try {
      switch (data.command) {
        case 'cmd:upgrade':
          await this.handleUpgradeCommand(data.data);
          break;
        case 'cmd:rollback':
          await this.handleRollbackCommand(data.data);
          break;
        case 'cmd:status':
          await this.handleStatusCommand(data.data);
          break;
        default:
          console.warn('未知命令:', data.command);
      }
    } catch (error) {
      console.error('命令处理失败:', error);
      this.sendCommandResult(data.commandId, false, error.message);
    }
  }
  
  async handleUpgradeCommand(data) {
    console.log('执行升级命令:', data);
    
    try {
      this.agent.reportStatus('upgrading');
      
      const { project, fileName, version, deployPath } = data;
      
      // 1. 下载升级包
      console.log('开始下载升级包...');
      const downloadResult = await this.agent.getDownloadManager()
        .downloadPackage(project, fileName);
      
      if (!downloadResult.success) {
        throw new Error(`下载失败: ${downloadResult.error}`);
      }
      
      // 2. 部署升级包
      console.log('开始部署升级包...');
      const deployResult = await this.agent.getDeployManager()
        .deploy(project, downloadResult.filePath, version, deployPath);
      
      if (!deployResult.success) {
        throw new Error(`部署失败: ${deployResult.error}`);
      }
      
      this.agent.reportStatus('upgrade_success');
      this.sendCommandResult(data.commandId, true, '升级成功');
      // 升级成功后，立即刷新 storage/rollbackAvailable 等
      if (deployPath) {
        this.agent.updateSystemInfoAfterRegistration(deployPath).catch(error => {
          console.error('升级后更新系统信息失败:', error.message);
        });
      }
      
      console.log('升级完成');
    } catch (error) {
      console.error('升级失败:', error);
      this.agent.reportStatus('upgrade_failed');
      this.sendCommandResult(data.commandId, false, error.message);
    }
  }
  
  async handleRollbackCommand(data) {
    console.log('执行降级命令:', data);
    
    try {
      this.agent.reportStatus('rolling_back');
      
      const { project, version } = data;
      
      // 执行回滚
      const rollbackResult = await this.agent.getDeployManager()
        .rollback(project, version);
      
      if (!rollbackResult.success) {
        throw new Error(`回滚失败: ${rollbackResult.error}`);
      }
      
      this.agent.reportStatus('rollback_success');
      this.sendCommandResult(data.commandId, true, '回滚成功');
      // 回滚完成后，同步刷新 storage/rollbackAvailable 等
      const dp = data?.deployPath;
      if (dp) {
        this.agent.updateSystemInfoAfterRegistration(dp).catch(error => {
          console.error('回滚后更新系统信息失败:', error.message);
        });
      }
      
      console.log('回滚完成');
    } catch (error) {
      console.error('回滚失败:', error);
      this.agent.reportStatus('rollback_failed');
      this.sendCommandResult(data.commandId, false, error.message);
    }
  }
  
  async handleStatusCommand(data) {
    console.log('查询设备状态:', data);

    try {
      const si = await import('systeminformation');
      const systemUptime = Math.floor((await si.default.time()).uptime);

      const deployManager = this.agent.getDeployManager();
      const status = {
        deviceId: this.agent.config.device.id,
        timestamp: new Date().toISOString(),
        frontend: await deployManager.getCurrentVersion('frontend'),
        backend: await deployManager.getCurrentVersion('backend'),
        system: {
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          uptime: systemUptime, // 使用系统运行时间而不是进程运行时间
          memory: process.memoryUsage()
        }
      };

      this.sendCommandResult(data.commandId, true, '状态查询成功', status);
    } catch (error) {
      console.error('状态查询失败:', error);
      this.sendCommandResult(data.commandId, false, error.message);
    }
  }
  
  handleHeartbeatPong(data) {
    // 心跳响应处理
    if (data && data.timestamp) {
      const now = Date.now();
      const sendTime = new Date(data.timestamp).getTime();
      const latency = now - sendTime;
      console.log(`心跳延迟: ${latency}ms`);
    } else {
      console.log('心跳响应: 收到服务端确认');
    }
  }
  
  startHeartbeat() {
    // 每30秒发送一次心跳
    this.heartbeatInterval = setInterval(async () => {
      if (this.socket.connected) {
        // 获取系统运行时间
        const si = await import('systeminformation');
        const systemUptime = Math.floor((await si.default.time()).uptime);

        this.socket.emit('device:heartbeat', {
          deviceId: this.agent.config.device.id,
          timestamp: Date.now(),
          health: {
            uptimeSeconds: systemUptime
          }
        });
      }
    }, 30000);
  }
  
  sendCommandResult(commandId, success, message, data = null) {
    this.socket.emit('command:result', {
      commandId,
      deviceId: this.agent.config.device.id,
      success,
      message,
      data,
      timestamp: new Date().toISOString()
    });
  }
  
  cleanup() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }
}
