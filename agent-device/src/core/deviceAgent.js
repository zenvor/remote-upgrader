// 中文注释：ESM 导入
import { io } from 'socket.io-client';
import SocketHandler from './socketHandler.js';
import DownloadManager from '../services/downloadManager.js';
import DeployManager from '../services/deployManager.js';
import DeviceIdGenerator from '../utils/deviceId.js';
import si from 'systeminformation';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { defaultPathValidator } from '../utils/pathValidator.js';

export default class DeviceAgent {
  constructor(config) {
    this.config = config;
    this.socket = null;
    this.socketHandler = null;
    this.downloadManager = null;
    this.deployManager = null;
    this.isConnected = false;
    this.isRegistered = false;
    this.reconnectAttempts = 0;
    this.baseReconnectDelay = config.server.reconnectDelay; // 基础重连延迟
    this.maxReconnectDelay = 300000; // 最大延迟 5 分钟
    this.reconnectTimer = null;
  }
  
  async start() {
    // 确保必要目录存在
    await this.ensureDirectories();
    
    // 生成稳定的设备唯一标识符
    await this.initializeDeviceId();
    
    // 初始化服务组件
    this.downloadManager = new DownloadManager(this.config);
    this.deployManager = new DeployManager(this.config);
    
    // 建立 Socket.IO 连接
    await this.connect();
  }
  
  async connect() {
    console.log(`尝试连接服务器: ${this.config.server.url}`);
    
    this.socket = io(this.config.server.url, {
      timeout: this.config.server.timeout,
      autoConnect: false
    });
    
    // 初始化 Socket 事件处理
    this.socketHandler = new SocketHandler(this.socket, this);
    this.setupSocketEvents();
    
    // 开始连接
    this.socket.connect();
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log('连接超时，将开始指数退避重连策略');
        this.scheduleReconnect();
        resolve();
      }, this.config.server.timeout);
      
      this.socket.once('connect', () => {
        clearTimeout(timeout);
        resolve();
      });
      
      this.socket.once('connect_error', (error) => {
        clearTimeout(timeout);
        this.handleConnectionError(error);
        resolve();
      });
    });
  }
  
  setupSocketEvents() {
    this.socket.on('connect', () => this.onConnected());
    this.socket.on('disconnect', () => this.onDisconnected());
    this.socket.on('connect_error', (error) => this.handleConnectionError(error));
    this.socket.on('reconnect', () => this.onReconnected());
  }
  
  onConnected() {
    console.log('✅ 成功连接到升级服务器');
    this.isConnected = true;
    this.reconnectAttempts = 0; // 重置重连计数
    this.clearReconnectTimer(); // 清除重连定时器
    
    // 注册设备（避免重复注册）
    if (!this.isRegistered) {
      this.registerDevice();
    }
  }
  
  onDisconnected() {
    console.log('🔌 与服务器连接断开');
    this.isConnected = false;
    this.isRegistered = false; // 重置注册状态
    
    // 开始指数退避重连
    this.scheduleReconnect();
  }
  
  handleConnectionError(error) {
    const errorMsg = this.getErrorMessage(error);
    console.log(`❌ 连接失败: ${errorMsg}`);
    this.isConnected = false;
    
    // 开始指数退避重连
    this.scheduleReconnect();
  }
  
  onReconnected() {
    console.log('🔄 已重新连接到服务器');
    // 重连后需要重新注册
    this.registerDevice();
  }
  
  scheduleReconnect() {
    // 如果已经有重连定时器，不要重复设置
    if (this.reconnectTimer) {
      return;
    }
    
    // 检查是否超过最大重连次数
    if (this.reconnectAttempts >= this.config.server.maxReconnectAttempts) {
      console.log(`⏸️  已达到最大重连次数 (${this.config.server.maxReconnectAttempts})，进入长时间等待模式`);
      // 达到最大次数后，使用最大延迟继续尝试（类似 GMS）
      this.reconnectAttempts = this.config.server.maxReconnectAttempts - 1;
    }
    
    // 指数退避算法：delay = baseDelay * (2 ^ attempts) + 随机抖动
    const exponentialDelay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts);
    const jitter = Math.random() * 1000; // 添加 0-1000ms 的随机抖动
    const finalDelay = Math.min(exponentialDelay + jitter, this.maxReconnectDelay);
    
    this.reconnectAttempts++;
    
    console.log(`⏳ 将在 ${Math.round(finalDelay / 1000)}s 后重试连接 (第 ${this.reconnectAttempts} 次)`);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.attemptReconnect();
    }, finalDelay);
  }
  
  async attemptReconnect() {
    if (!this.isConnected) {
      console.log(`🔄 正在重连...`);
      this.socket.connect();
    }
  }
  
  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
  
  getErrorMessage(error) {
    if (error.code === 'ECONNREFUSED') {
      return '服务器拒绝连接 (可能服务器未启动)';
    } else if (error.message && error.message.includes('xhr poll error')) {
      return '网络连接错误';
    } else {
      return error.message || '未知连接错误';
    }
  }
  
  async registerDevice() {
    try {
      // 动态获取系统主机名作为设备名称
      const systemHostname = await this.getSystemHostname();
      
      // 汇总系统信息
      const osInfo = await si.osInfo();
      const agentVersion = await this.getAgentVersion();
      
      // 先快速注册基本信息，然后异步更新WiFi和公网IP信息
      const basicDeviceInfo = {
        deviceId: this.config.device.id,
        deviceName: systemHostname || this.config.device.name, // 优先使用系统主机名
        version: this.config.device.version,
        // 分组后的字段
        system: {
          platform: process.platform || this.config.device.platform,
          osVersion: osInfo?.release || osInfo?.build || null,
          arch: process.arch || this.config.device.arch
        },
        agent: {
          agentVersion: agentVersion
        },
        network: {
          wifiName: null,
          wifiSignal: null,
          publicIp: null,
          localIp: null,
          macAddresses: []
        },
        timestamp: new Date().toISOString(),
        status: 'online'
      };
      
      console.log('注册设备信息:', basicDeviceInfo.deviceId, `(${basicDeviceInfo.deviceName}) 获取网络信息中...`);
      this.socket.emit('device:register', basicDeviceInfo);
      this.isRegistered = true;
      
      // 异步获取网络信息并更新
      this.updateNetworkInfo();
    } catch (error) {
      console.error('❌ 设备注册失败:', error);
      this.isRegistered = true;
    }
  }
  async getAgentVersion() {
    try {
      // 从 package.json 读取自身版本
      const pkgPath = path.resolve(process.cwd(), 'package.json');
      if (await fs.pathExists(pkgPath)) {
        const pkg = await fs.readJSON(pkgPath);
        if (pkg && pkg.version) return pkg.version;
      }
      return this.config?.device?.agentVersion || null;
    } catch (e) {
      return this.config?.device?.agentVersion || null;
    }
  }
  
  async updateNetworkInfo() {
    try {
      // 并行获取WiFi、公网IP、本地地址和MAC
      const [wifiInfo, publicIp, localIp, macAddresses] = await Promise.all([
        this.getWifiInfo(),
        this.getPublicIp(),
        this.getLocalIp(),
        this.getMacAddresses()
      ]);
      
      if (this.socket && this.socket.connected) {
        // 按分组字段发送网络信息，适配 server-koa 期望的结构
        const networkUpdate = {
          deviceId: this.config.device.id,
          network: {
            wifiName: wifiInfo?.ssid || null,
            wifiSignal: wifiInfo?.signal || null,
            publicIp: publicIp,
            localIp,
            macAddresses
          },
          timestamp: new Date().toISOString()
        };

        console.log('🌐 更新网络信息:', {
          wifi: wifiInfo?.ssid || '无WiFi连接',
          publicIp: publicIp || '获取失败',
          localIp: localIp || '未知',
          macCount: Array.isArray(macAddresses) ? macAddresses.length : 0
        });

        this.socket.emit('device:update-network', networkUpdate);
      }
    } catch (error) {
      console.log('⚠️ 更新网络信息失败:', error.message);
    }
  }

  async updateWifiInfo() {
    try {
      const wifiInfo = await this.getWifiInfo();
      if (wifiInfo.ssid && this.socket && this.socket.connected) {
        console.log('🌐 更新WiFi信息:', wifiInfo.ssid);
        this.socket.emit('device:update-wifi', {
          deviceId: this.config.device.id,
          wifiName: wifiInfo.ssid,
          wifiSignal: wifiInfo.signal,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.log('⚠️ 更新WiFi信息失败:', error.message);
    }
  }
  
  /**
   * 获取系统主机名/设备名称
   */
  async getSystemHostname() {
    try {
      // 方法1：使用 systeminformation 获取操作系统信息
      const osInfo = await si.osInfo();
      if (osInfo.hostname && osInfo.hostname.trim()) {
        let hostname = osInfo.hostname.trim();
        
        // 如果主机名包含 .local 后缀，去掉它（macOS常见）
        if (hostname.endsWith('.local')) {
          hostname = hostname.replace('.local', '');
        }
        
        console.log('🖥️  从系统信息获取主机名:', hostname);
        return hostname;
      }
      
      // 方法2：使用 Node.js os 模块获取主机名
      const hostname = os.hostname();
      if (hostname && hostname.trim()) {
        let cleanHostname = hostname.trim();
        if (cleanHostname.endsWith('.local')) {
          cleanHostname = cleanHostname.replace('.local', '');
        }
        console.log('🖥️  从OS模块获取主机名:', cleanHostname);
        return cleanHostname;
      }
      
      // 方法3：从环境变量获取（Windows COMPUTERNAME, Unix HOSTNAME）
      const envHostname = process.env.COMPUTERNAME || process.env.HOSTNAME;
      if (envHostname && envHostname.trim()) {
        console.log('🖥️  从环境变量获取主机名:', envHostname.trim());
        return envHostname.trim();
      }
      
      // 方法4：尝试获取用户信息作为备选
      const userInfo = os.userInfo();
      if (userInfo.username) {
        const fallbackName = `${userInfo.username}的设备`;
        console.log('🖥️  使用用户名作为设备名:', fallbackName);
        return fallbackName;
      }
      
      console.log('⚠️ 无法获取系统主机名，将使用配置文件中的默认名称');
      return null;
    } catch (error) {
      console.log('⚠️ 获取系统主机名失败:', error.message);
      return null;
    }
  }

  /**
   * 获取公网IP地址
   */
  async getPublicIp() {
    const services = [
      'https://api.ipify.org/?format=text',
      'https://ipinfo.io/ip',
      'https://api.myip.com',
      'https://httpbin.org/ip',
      'https://icanhazip.com'
    ];

    for (const serviceUrl of services) {
      try {
        console.log(`🌍 尝试从 ${serviceUrl} 获取公网IP...`);
        
        const response = await fetch(serviceUrl, {
          method: 'GET',
          timeout: 5000, // 5秒超时
          headers: {
            'User-Agent': 'RemoteUpgrader-Device/1.0'
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const text = await response.text();
        let ip = null;

        // 处理不同服务的响应格式
        if (serviceUrl.includes('myip.com')) {
          const data = JSON.parse(text);
          ip = data.ip;
        } else if (serviceUrl.includes('httpbin.org')) {
          const data = JSON.parse(text);
          ip = data.origin;
        } else {
          // ipify.org, ipinfo.io, icanhazip.com 直接返回IP
          ip = text.trim();
        }

        // 验证IP格式
        if (this.isValidIp(ip)) {
          console.log('🌍 获取到公网IP:', ip);
          return ip;
        }

      } catch (error) {
        console.log(`⚠️ 从 ${serviceUrl} 获取公网IP失败:`, error.message);
        continue;
      }
    }

    console.log('❌ 所有公网IP服务都无法访问');
    return null;
  }

  /**
   * 验证IP地址格式
   */
  isValidIp(ip) {
    if (!ip || typeof ip !== 'string') return false;
    
    // IPv4正则表达式
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    
    // IPv6正则表达式（简化版）
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    
    return ipv4Regex.test(ip.trim()) || ipv6Regex.test(ip.trim());
  }

  /**
   * 获取当前连接的WiFi信息（带超时处理）
   */
  async getWifiInfo() {
    try {
      // 设置超时：最多等待3秒获取WiFi信息
      const wifiPromise = si.wifiConnections();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('WiFi info timeout')), 3000);
      });
      
      const wifiConnections = await Promise.race([wifiPromise, timeoutPromise]);
      
      if (wifiConnections && wifiConnections.length > 0) {
        // 找到当前活动的WiFi连接
        const activeWifi = wifiConnections.find(wifi => wifi.active) || wifiConnections[0];
        
        return {
          ssid: activeWifi.ssid || null,
          signal: activeWifi.signalLevel || null,
          frequency: activeWifi.frequency || null,
          type: activeWifi.type || null
        };
      }
      
      return {
        ssid: null,
        signal: null,
        frequency: null,
        type: null
      };
    } catch (error) {
      console.log('⚠️ 获取WiFi信息失败:', error.message);
      return {
        ssid: null,
        signal: null,
        frequency: null,
        type: null
      };
    }
  }

  /**
   * 获取本地 IP（首个非内网无效地址优先，退化为首个 IPv4）
   */
  async getLocalIp() {
    try {
      const interfaces = os.networkInterfaces();
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] || []) {
          if (!iface.internal && iface.family === 'IPv4') {
            return iface.address;
          }
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * 获取 MAC 列表
   */
  async getMacAddresses() {
    try {
      const interfaces = os.networkInterfaces();
      const macs = new Set();
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] || []) {
          if (iface.mac && iface.mac !== '00:00:00:00:00:00') macs.add(iface.mac);
        }
      }
      return Array.from(macs);
    } catch (e) {
      return [];
    }
  }

  // 在拿到 deployPath 后，计算 storage 与回滚能力并上报
  async updateSystemInfoAfterRegistration(deployPath) {
    try {
      console.log('🔧 开始更新系统信息，原始部署路径:', deployPath);

      // 验证部署路径安全性
      const pathValidation = defaultPathValidator.validatePath(deployPath, 'system-info-update');
      if (!pathValidation.valid) {
        console.warn(`⚠️ 部署路径不安全，跳过系统信息更新: ${pathValidation.reason}`);
        return;
      }

      const safeDeployPath = pathValidation.sanitizedPath;
      console.log('✅ 使用安全验证后的部署路径:', safeDeployPath);

      const diskInfo = await this.getDiskInfoByPath(safeDeployPath);
      const writable = await this.checkWritable(safeDeployPath);
      const rollbackAvailable = await this.checkRollbackAvailable();

      const payload = {
        deviceId: this.config.device.id,
        // 按分组字段发送，适配 server-koa 期望的结构
        agent: {
          agentVersion: this.config?.device?.agentVersion || '1.0.0'
        },
        system: {
          osVersion: (await si.osInfo())?.release || null,
          arch: this.config.device.arch
        },
        storage: {
          diskFreeBytes: diskInfo?.free ?? null,
          writable
        },
        deploy: {
          rollbackAvailable
        },
        health: {
          uptimeSeconds: Math.floor((await si.time()).uptime)
        }
      };

      console.log('📊 系统信息收集完成:', {
        diskFreeBytes: diskInfo?.free ?? null,
        writable,
        rollbackAvailable,
        arch: this.config.device.arch
      });

      if (this.socket && this.socket.connected) {
        this.socket.emit('device:update-system', payload);
        console.log('✅ 系统信息已发送到服务器');
      } else {
        console.log('⚠️ Socket未连接，无法发送系统信息');
      }
    } catch (e) {
      console.error('❌ 更新系统信息失败:', e.message);
    }
  }

  async getDiskInfoByPath(targetPath) {
    try {
      if (!targetPath) return null;
      const fsSize = await si.fsSize();
      // 简单匹配：找到包含路径的分区
      const match = fsSize.find(v => targetPath.startsWith(v.mount));
      return match ? { free: match.available, total: match.size, mount: match.mount } : null;
    } catch (e) {
      return null;
    }
  }

  async checkWritable(targetPath) {
    try {
      if (!targetPath) return null;
      const testFile = path.join(targetPath, `.rwtest-${Date.now()}`);
      await fs.outputFile(testFile, 'rw');
      await fs.remove(testFile);
      return true;
    } catch (e) {
      return false;
    }
  }

  async checkRollbackAvailable() {
    try {
      const backupDir = this.config.deploy.backupDir;
      if (!backupDir) return null;
      const exists = await fs.pathExists(backupDir);
      if (!exists) return false;
      const files = await fs.readdir(backupDir);
      return files && files.length > 0;
    } catch (e) {
      return null;
    }
  }

  /**
   * 初始化设备唯一标识符
   */
  async initializeDeviceId() {
    try {
      console.log('🔧 初始化设备唯一标识符...');
      
      // 优先使用环境变量中的设备ID (用于测试和手动指定)
      if (process.env.DEVICE_ID) {
        console.log('📝 使用环境变量中的设备ID:', process.env.DEVICE_ID);
        this.config.device.id = process.env.DEVICE_ID;
        return;
      }
      
      // 使用智能设备ID生成器
      const deviceIdGenerator = new DeviceIdGenerator();
      const deviceId = await deviceIdGenerator.generateDeviceId();
      
      this.config.device.id = deviceId;
      console.log('✅ 设备ID已初始化:', deviceId);
      
      // 获取设备详细信息用于调试和日志
      const deviceInfo = await deviceIdGenerator.getDeviceInfo();
      console.log('📊 设备信息:', {
        manufacturer: deviceInfo.manufacturer,
        model: deviceInfo.model,
        platform: deviceInfo.platform,
        hostname: deviceInfo.hostname,
        arch: deviceInfo.arch
      });
      
    } catch (error) {
      console.error('❌ 初始化设备ID失败:', error);
      // fallback到时间戳ID
      const fallbackId = `device-fallback-${Date.now()}`;
      this.config.device.id = fallbackId;
      console.log('⚠️ 使用fallback设备ID:', fallbackId);
    }
  }

  async ensureDirectories() {
    const dirs = [
      this.config.download.tempDir,
      this.config.download.packageDir,
      this.config.deploy.frontendDir,
      this.config.deploy.backendDir,
      this.config.deploy.backupDir,
      path.dirname(this.config.log.file)
    ];
    
    for (const dir of dirs) {
      await fs.ensureDir(dir);
    }
  }
  
  // 获取下载管理器
  getDownloadManager() {
    return this.downloadManager;
  }
  
  // 获取部署管理器
  getDeployManager() {
    return this.deployManager;
  }
  
  // 发送设备状态
  reportStatus(status) {
    if (this.isConnected) {
      this.socket.emit('device:status', {
        deviceId: this.config.device.id,
        status,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  // 断开连接
  disconnect() {
    this.clearReconnectTimer();
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}