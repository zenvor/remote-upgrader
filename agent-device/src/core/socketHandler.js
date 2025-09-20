// 中文注释：Socket 事件处理器（ESM 默认导出）
import { ErrorLogger, DateHelper } from '../utils/common.js';

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
      this.handleUpgradeCommand(data, data?.commandId);
    });
    
    // 降级命令
    this.socket.on('cmd:rollback', (data) => {
      this.handleRollbackCommand(data, data?.commandId);
    });
    
    // 状态查询命令
    this.socket.on('cmd:status', (data) => {
      this.handleStatusCommand(data, data?.commandId);
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
    // 注册后立即上报存储与回滚能力，使用服务端回传的 deployPath 或默认路径
    const deployPath = (data && data.deployPath) ? data.deployPath : process.cwd();
    this.agent.updateSystemInfoAfterRegistration(deployPath).catch(error => {
      ErrorLogger.logError('注册后更新系统信息', error, { deployPath });
    });
  }
  
  async handleCommand(message) {
    console.log('收到服务端命令:', message);

    const command = message?.command;
    const params = message?.params ?? message?.data ?? {};
    const messageId = message?.messageId || message?.commandId || null;

    try {
      switch (command) {
        case 'cmd:upgrade':
          await this.handleUpgradeCommand(params, messageId);
          break;
        case 'cmd:rollback':
          await this.handleRollbackCommand(params, messageId);
          break;
        case 'cmd:status':
          await this.handleStatusCommand(params, messageId);
          break;
        case 'getCurrentVersion':
          await this.handleGetCurrentVersionCommand(params, messageId);
          break;
        case 'getDeployPath':
          console.warn('getDeployPath 命令已废弃，不再支持');
          if (messageId) {
            this.sendCommandResult(messageId, false, 'getDeployPath 命令已废弃');
          }
          break;
        default:
          console.warn('未知命令:', command);
          if (messageId) {
            this.sendCommandResult(messageId, false, '不支持的命令');
          }
      }
    } catch (error) {
      console.error('命令处理失败:', error);
      if (messageId) {
        this.sendCommandResult(messageId, false, error.message);
      }
    }
  }
  
  async handleUpgradeCommand(data, messageId = null) {
    console.log('执行升级命令:', data);

    const commandId = messageId || data?.commandId || null;

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
        .deploy(project, downloadResult.filePath, version, deployPath, data.fileMD5 || null);

      if (!deployResult.success) {
        throw new Error(`部署失败: ${deployResult.error}`);
      }

      this.agent.reportStatus('upgrade_success');

      if (commandId) {
        const packageInfo = deployResult.packageInfo
          ? { ...deployResult.packageInfo }
          : null;
        if (packageInfo && data.fileMD5) {
          packageInfo.fileMD5 = data.fileMD5;
        }

        this.sendCommandResult(commandId, true, '升级成功', {
          operation: 'upgrade',
          project,
          version,
          deployPath: deployResult.deployPath || deployPath || null,
          packageInfo
        });
      }

      // 升级成功后刷新系统信息，确保回滚状态与磁盘信息更新
      const actualDeployPath = deployResult.deployPath || deployPath;
      if (actualDeployPath) {
        this.agent.updateSystemInfoAfterRegistration(actualDeployPath).catch(error => {
          console.error('升级后更新系统信息失败:', error.message);
        });
      }

      console.log('升级完成');
    } catch (error) {
      console.error('升级失败:', error);
      this.agent.reportStatus('upgrade_failed');
      if (commandId) {
        this.sendCommandResult(commandId, false, error.message);
      }
    }
  }
  
  async handleRollbackCommand(data, messageId = null) {
    console.log('执行降级命令:', data);

    const commandId = messageId || data?.commandId || null;

    try {
      this.agent.reportStatus('rolling_back');

      const { project } = data;

      // 执行回滚
      const rollbackResult = await this.agent.getDeployManager()
        .rollback(project);

      if (!rollbackResult.success) {
        throw new Error(`回滚失败: ${rollbackResult.error}`);
      }

      this.agent.reportStatus('rollback_success');

      if (commandId) {
        this.sendCommandResult(commandId, true, '回滚成功', {
          operation: 'rollback',
          project,
          deployPath: rollbackResult.deployPath || null
        });
      }

      // 回滚完成后，同步刷新系统信息
      const targetPath = rollbackResult.deployPath
        || (project === 'backend' ? this.agent.config.deploy.backendDir : this.agent.config.deploy.frontendDir);

      if (targetPath) {
        this.agent.updateSystemInfoAfterRegistration(targetPath).catch(error => {
          console.error('回滚后更新系统信息失败:', error.message);
        });
      }

      console.log('回滚完成');
    } catch (error) {
      console.error('回滚失败:', error);
      this.agent.reportStatus('rollback_failed');
      if (commandId) {
        this.sendCommandResult(commandId, false, error.message);
      }
    }
  }
  
  async handleStatusCommand(data, messageId = null) {
    console.log('查询设备状态:', data);

    const commandId = messageId || data?.commandId || null;

    try {
      const si = await import('systeminformation');
      const systemUptime = Math.floor((await si.default.time()).uptime);

      const deployManager = this.agent.getDeployManager();
      const status = {
        deviceId: this.agent.config.device.id,
        timestamp: DateHelper.getCurrentDate(),
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

      if (commandId) {
        this.sendCommandResult(commandId, true, '状态查询成功', status);
      }
    } catch (error) {
      console.error('状态查询失败:', error);
      if (commandId) {
        this.sendCommandResult(commandId, false, error.message);
      }
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
    const response = {
      commandId,
      deviceId: this.agent.config.device.id,
      success,
      message,
      data,
      timestamp: DateHelper.getCurrentDate()
    };

    // 发送传统格式响应
    this.socket.emit('command:result', response);

    // 如果 commandId 看起来像 messageId (含有 cmd_ 前缀)，也发送新格式响应
    if (commandId && commandId.startsWith('cmd_')) {
      this.socket.emit(`response:${commandId}`, response);
    }
  }

  // 版本管理命令处理方法
  async handleGetCurrentVersionCommand(params, messageId = null) {
    console.log('📋 开始处理 getCurrentVersion 命令:', params);

    const commandId = messageId || params?.commandId || null;

    try {
      const { project } = params;

      if (!project || !['frontend', 'backend'].includes(project)) {
        if (commandId) {
          this.sendCommandResult(commandId, false, '项目类型参数无效，必须是 frontend 或 backend');
        }
        return;
      }

      const deployManager = this.agent.getDeployManager();
      const versionInfo = await deployManager.getCurrentVersion(project);

      if (!versionInfo?.success) {
        throw new Error(versionInfo?.error || '获取版本信息失败');
      }

      if (commandId) {
        this.sendCommandResult(commandId, true, '获取当前版本成功', versionInfo);
      }
    } catch (error) {
      console.error('❌ 获取当前版本失败:', error);
      if (commandId) {
        this.sendCommandResult(commandId, false, error.message);
      }
    }
  }


  /**
   * 发送通知到服务器
   */
  sendNotification(eventName, data) {
    try {
      if (this.socket && this.socket.connected) {
        this.socket.emit(eventName, data);
        console.log(`📡 已发送通知到服务器: ${eventName}`);
      } else {
        console.warn('无法发送通知：Socket 未连接');
      }
    } catch (error) {
      console.error('发送通知失败:', error);
    }
  }

  cleanup() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }
}
