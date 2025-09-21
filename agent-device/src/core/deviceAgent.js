// 中文注释：ESM 导入
import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import { io } from 'socket.io-client'
import si from 'systeminformation'
import DeployManager from '../services/deployManager.js'
import DownloadManager from '../services/downloadManager.js'
import { DateHelper } from '../utils/common.js'
import DeviceIdGenerator from '../utils/deviceId.js'
import SocketHandler from './socketHandler.js'

export default class DeviceAgent {
  constructor(config) {
    // 验证必需的配置
    this.validateConfig(config)

    this.config = config // 配置

    // 常量配置
    this.constants = {
      maxReconnectDelay: 300_000, // 5分钟
      jitterRange: 1000, // 重连抖动范围 1秒
      wifiTimeout: 3000, // WiFi信息获取超时
      publicIpTimeout: 5000, // 公网IP获取超时
      statusSendDelay: 100, // 状态发送延迟
      networkUpdateTimeout: 30_000 // 网络信息更新超时
    }

    this.socket = null // Socket
    this.socketHandler = null // Socket 处理器
    this.downloadManager = null // 下载管理器
    this.deployManager = null // 部署管理器
    this.isConnected = false // 是否连接
    this.isRegistered = false // 是否注册
    this.reconnectAttempts = 0 // 重连次数
    this.baseReconnectDelay = config.server.reconnectDelay // 基础重连延迟
    this.maxReconnectDelay = this.constants.maxReconnectDelay
    this.reconnectTimer = null // 重连定时器

    // 并发控制
    this.registerPromise = null // 注册操作的Promise
    this.networkUpdatePromise = null // 网络信息更新的Promise

    // 公网IP服务配置
    this.publicIpServices = [
      'https://api.ipify.org/?format=text',
      'https://ipinfo.io/ip',
      'https://api.myip.com',
      'https://httpbin.org/ip',
      'https://icanhazip.com'
    ]
  }

  validateConfig(config) {
    if (!config) {
      throw new Error('配置对象不能为空')
    }

    const requiredFields = [
      'server.url',
      'server.timeout',
      'server.reconnectDelay',
      'server.maxReconnectAttempts',
      'download.tempDir',
      'download.packageDir',
      'deploy.frontendDir',
      'deploy.backendDir',
      'deploy.backupDir',
      'log.file'
    ]

    for (const field of requiredFields) {
      const value = this.getNestedValue(config, field)
      if (value === undefined || value === null) {
        throw new Error(`配置缺少必需字段: ${field}`)
      }
    }

    // 验证服务器URL格式
    try {
      new URL(config.server.url)
    } catch {
      throw new Error('服务器URL格式无效')
    }

    // 验证数值类型
    if (typeof config.server.timeout !== 'number' || config.server.timeout <= 0) {
      throw new Error('服务器超时时间必须是正数')
    }
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj)
  }

  async start() {
    // 确保必要目录存在
    await this.ensureDirectories()

    // 生成稳定的设备唯一标识符
    await this.initializeDeviceId()

    // 初始化服务组件
    this.downloadManager = new DownloadManager(this.config)
    this.deployManager = new DeployManager(this.config, this)

    // 初始化部署管理器（包括版本管理器）
    await this.deployManager.initialize()

    // 建立 Socket.IO 连接
    await this.connect()
  }

  async connect() {
    console.log(`尝试连接服务器: ${this.config.server.url}`)

    this.socket = io(this.config.server.url, {
      timeout: this.config.server.timeout,
      autoConnect: false
    })

    // 初始化 Socket 事件处理
    this.socketHandler = new SocketHandler(this.socket, this)
    this.setupSocketEvents()

    // 开始连接
    this.socket.connect()

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log('连接超时，将开始指数退避重连策略')
        this.scheduleReconnect()
        resolve()
      }, this.config.server.timeout)

      this.socket.once('connect', () => {
        clearTimeout(timeout)
        resolve()
      })

      this.socket.once('connect_error', (error) => {
        clearTimeout(timeout)
        this.handleConnectionError(error)
        resolve()
      })
    })
  }

  setupSocketEvents() {
    this.socket.on('connect', () => this.onConnected())
    this.socket.on('disconnect', () => this.onDisconnected())
    this.socket.on('connect_error', (error) => this.handleConnectionError(error))
    // 注意：Socket.IO 客户端没有 'reconnect' 事件，重连通过 'connect' 事件处理
  }

  onConnected() {
    const isReconnection = this.reconnectAttempts > 0
    console.log(isReconnection ? '🔄 已重新连接到服务器' : '✅ 成功连接到升级服务器')

    this.isConnected = true
    this.clearReconnectTimer() // 清除重连定时器
    this.reconnectAttempts = 0 // 重置重连计数（在清除定时器后）

    // 连接后都需要注册（初次连接或重连）
    this.registerDevice()
  }

  onDisconnected() {
    console.log('🔌 与服务器连接断开')
    this.isConnected = false
    this.isRegistered = false // 断开连接时重置注册状态

    // 开始指数退避重连
    this.scheduleReconnect()
  }

  handleConnectionError(error) {
    const errorMessage = this.getErrorMessage(error)
    console.log(`❌ 连接失败: ${errorMessage}`)
    this.isConnected = false

    // 开始指数退避重连
    this.scheduleReconnect()
  }

  scheduleReconnect() {
    // 如果已经有重连定时器，不要重复设置
    if (this.reconnectTimer) {
      return
    }

    // 检查是否超过最大重连次数
    if (this.reconnectAttempts >= this.config.server.maxReconnectAttempts) {
      console.log(`⏸️  已达到最大重连次数 (${this.config.server.maxReconnectAttempts})，进入长时间等待模式`)
      // 达到最大次数后，使用最大延迟继续尝试（类似 GMS）
      this.reconnectAttempts = this.config.server.maxReconnectAttempts - 1
    }

    // 指数退避算法：delay = baseDelay * (2 ^ attempts) + 随机抖动
    const exponentialDelay = this.baseReconnectDelay * 2 ** this.reconnectAttempts
    const jitter = Math.random() * this.constants.jitterRange
    const finalDelay = Math.min(exponentialDelay + jitter, this.maxReconnectDelay)

    this.reconnectAttempts++

    console.log(`⏳ 将在 ${Math.round(finalDelay / 1000)}s 后重试连接 (第 ${this.reconnectAttempts} 次)`)

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.attemptReconnect()
    }, finalDelay)
  }

  async attemptReconnect() {
    if (!this.isConnected && this.socket) {
      console.log(`🔄 正在重连...`)
      try {
        this.socket.connect()
      } catch (error) {
        console.error('❌ 重连尝试失败:', error.message)
        // 继续重连调度
        this.scheduleReconnect()
      }
    }
  }

  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  getErrorMessage(error) {
    if (error.code === 'ECONNREFUSED') {
      return '服务器拒绝连接 (可能服务器未启动)'
    }

    if (error.message && error.message.includes('xhr poll error')) {
      return '网络连接错误'
    }

    return error.message || '未知连接错误'
  }

  async registerDevice() {
    // 避免并发注册
    if (this.registerPromise) {
      console.log('⏳ 注册操作已在进行中，等待完成...')
      return this.registerPromise
    }

    this.registerPromise = this._doRegisterDevice()
    try {
      await this.registerPromise
    } finally {
      this.registerPromise = null
    }
  }

  async _doRegisterDevice() {
    try {
      // 动态获取系统主机名作为设备名称
      const systemHostname = await this.getSystemHostname()

      // 汇总系统信息
      const osInfo = await si.osInfo()
      const agentVersion = await this.getAgentVersion()

      // 先快速注册基本信息，然后异步更新WiFi和公网IP信息
      const basicDeviceInfo = {
        deviceId: this.config.device.id,
        deviceName: this.config.device.preferConfigName
          ? this.config.device.name // 优先使用配置的设备名称
          : systemHostname || this.config.device.name, // 优先使用系统主机名
        // 分组后的字段
        system: {
          platform: process.platform || this.config.device.platform,
          osVersion: osInfo?.release || osInfo?.build || null,
          arch: process.arch || this.config.device.arch
        },
        agent: {
          agentVersion
        },
        network: {
          wifiName: null,
          wifiSignal: null,
          publicIp: null,
          localIp: null,
          macAddresses: []
        },
        timestamp: DateHelper.getCurrentDate()
      }

      console.log('📝 注册设备信息:', basicDeviceInfo.deviceId, `(${basicDeviceInfo.deviceName}) 获取网络信息中...`)
      this.socket.emit('device:register', basicDeviceInfo)
      this.isRegistered = true

      // 异步获取网络信息并更新
      this.updateNetworkInfo()
    } catch (error) {
      console.error('❌ 设备注册失败:', error.message)
      this.isRegistered = false
    }
  }

  async getAgentVersion() {
    try {
      // 从 package.json 读取自身版本
      const pkgPath = path.resolve(process.cwd(), 'package.json')
      if (await fs.pathExists(pkgPath)) {
        const pkg = await fs.readJSON(pkgPath)
        if (pkg && pkg.version) return pkg.version
      }

      return this.config?.device?.agentVersion || null
    } catch {
      return this.config?.device?.agentVersion || null
    }
  }

  async updateNetworkInfo() {
    // 避免并发更新网络信息
    if (this.networkUpdatePromise) {
      console.log('⏳ 网络信息更新已在进行中，跳过此次更新')
      return this.networkUpdatePromise
    }

    this.networkUpdatePromise = this._doUpdateNetworkInfo()
    try {
      await this.networkUpdatePromise
    } finally {
      this.networkUpdatePromise = null
    }
  }

  async _doUpdateNetworkInfo() {
    try {
      // 并行获取WiFi、公网IP、本地地址和MAC（带超时保护）
      const networkInfoPromise = Promise.all([
        this.getWifiInfo(),
        this.getPublicIp(),
        this.getLocalIp(),
        this.getMacAddresses()
      ])

      let timeoutId = null
      const timeoutPromise = new Promise((_resolve, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Network info update timeout')),
          this.constants.networkUpdateTimeout
        )
      })

      try {
        const [wifiInfo, publicIp, localIp, macAddresses] = await Promise.race([networkInfoPromise, timeoutPromise])

        // 清理超时定时器
        if (timeoutId) {
          clearTimeout(timeoutId)
        }

        if (this.socket && this.socket.connected) {
          // 按分组字段发送网络信息，适配 server-koa 期望的结构
          const networkUpdate = {
            deviceId: this.config.device.id,
            network: {
              wifiName: wifiInfo?.ssid || null,
              wifiSignal: wifiInfo?.signal || null,
              publicIp,
              localIp,
              macAddresses
            },
            timestamp: DateHelper.getCurrentDate()
          }

          console.log('🌐 更新网络信息:', {
            wifi: wifiInfo?.ssid || '无WiFi连接',
            publicIp: publicIp || '获取失败',
            localIp: localIp || '未知',
            macCount: Array.isArray(macAddresses) ? macAddresses.length : 0
          })

          this.socket.emit('device:update-network', networkUpdate)
        }
      } catch (networkError) {
        // 清理超时定时器（如果获取网络信息失败）
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
        throw networkError
      }
    } catch (error) {
      console.error('⚠️ 更新网络信息失败:', error.message)
    }
  }

  async updateWifiInfo() {
    try {
      const wifiInfo = await this.getWifiInfo()
      if (wifiInfo.ssid && this.socket && this.socket.connected) {
        console.log('🌐 更新WiFi信息:', wifiInfo.ssid)
        this.socket.emit('device:update-wifi', {
          deviceId: this.config.device.id,
          wifiName: wifiInfo.ssid,
          wifiSignal: wifiInfo.signal,
          timestamp: DateHelper.getCurrentDate()
        })
      }
    } catch (error) {
      console.error('⚠️ 更新WiFi信息失败:', error.message)
    }
  }

  /**
   * 获取系统主机名/设备名称
   */
  async getSystemHostname() {
    try {
      const baseHostname = await this.getBaseHostname()
      if (!baseHostname) {
        console.log('⚠️ 无法获取系统主机名，将使用配置文件中的默认名称')
        return null
      }

      // 如果配置要求使用真实主机名，则不添加后缀
      if (this.config.device.useRealHostname) {
        console.log('🖥️  使用真实主机名（无后缀）:', baseHostname)
        return baseHostname
      }

      return this.generateDeviceName(baseHostname)
    } catch (error) {
      console.error('⚠️ 获取系统主机名失败:', error.message)
      return null
    }
  }

  /**
   * 获取基础主机名
   */
  async getBaseHostname() {
    // 方法1：从系统信息获取
    const systemHostname = await this.getHostnameFromSystem()
    if (systemHostname) return systemHostname

    // 方法2：从OS模块获取
    const osHostname = this.getHostnameFromOS()
    if (osHostname) return osHostname

    // 方法3：从环境变量获取
    const envHostname = this.getHostnameFromEnv()
    if (envHostname) return envHostname

    // 方法4：从用户信息获取
    const userHostname = this.getHostnameFromUser()
    if (userHostname) return userHostname

    return null
  }

  async getHostnameFromSystem() {
    try {
      const osInfo = await si.osInfo()
      if (osInfo.hostname && osInfo.hostname.trim()) {
        const hostname = this.cleanHostname(osInfo.hostname.trim())
        console.log('🖥️  从系统信息获取主机名:', hostname)
        return hostname
      }
    } catch {
      // 忽略错误，尝试下一种方法
    }
    return null
  }

  getHostnameFromOS() {
    try {
      const hostname = os.hostname()
      if (hostname && hostname.trim()) {
        const cleanedHostname = this.cleanHostname(hostname.trim())
        console.log('🖥️  从OS模块获取主机名:', cleanedHostname)
        return cleanedHostname
      }
    } catch {
      // 忽略错误，尝试下一种方法
    }
    return null
  }

  getHostnameFromEnv() {
    const envHostname = process.env.COMPUTERNAME || process.env.HOSTNAME
    if (envHostname && envHostname.trim()) {
      const hostname = envHostname.trim()
      console.log('🖥️  从环境变量获取主机名:', hostname)
      return hostname
    }
    return null
  }

  getHostnameFromUser() {
    try {
      const userInfo = os.userInfo()
      if (userInfo.username) {
        // 优先使用中文设备名，如果用户名看起来是英文名则使用"的设备"
        const isEnglishName = /^[a-zA-Z\s]+$/.test(userInfo.username)
        const hostname = isEnglishName ? `${userInfo.username}的MacBook` : `${userInfo.username}的设备`
        console.log('🖥️  使用用户名作为设备名:', hostname)
        return hostname
      }
    } catch {
      // 忽略错误
    }
    return null
  }

  cleanHostname(hostname) {
    // 去掉 .local 后缀（macOS常见）
    return hostname.endsWith('.local') ? hostname.replace('.local', '') : hostname
  }

  generateDeviceName(baseHostname) {
    // 优先使用环境变量中的实例ID
    const instanceId = process.env.AGENT_INSTANCE_ID
    if (instanceId) {
      const deviceName = `${baseHostname}-${instanceId}`
      console.log('🖥️  多实例设备名:', deviceName)
      return deviceName
    }

    // 使用进程ID作为区分
    const deviceName = `${baseHostname}-${process.pid}`
    console.log('🖥️  使用进程ID区分的设备名:', deviceName)
    return deviceName
  }

  /**
   * 获取公网IP地址
   */
  async getPublicIp() {
    // 并行尝试所有IP服务，提高成功率
    const promises = this.publicIpServices.map(async (serviceUrl) => {
      let timeoutId = null
      try {
        console.log(`🌍 尝试从 ${serviceUrl} 获取公网IP...`)

        const controller = new AbortController()
        timeoutId = setTimeout(() => controller.abort(), this.constants.publicIpTimeout)

        const response = await fetch(serviceUrl, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'User-Agent': 'RemoteUpgrader-Device/1.0'
          }
        })

        clearTimeout(timeoutId)
        timeoutId = null

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const text = await response.text()
        const ip = this.parseIpResponse(serviceUrl, text)

        // 验证IP格式
        if (this.isValidIp(ip)) {
          console.log('🌍 获取到公网IP:', ip)
          return ip
        }
        throw new Error('无效的IP格式')
      } catch (error) {
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
        console.error(`⚠️ 从 ${serviceUrl} 获取公网IP失败:`, error.message)
        throw error
      }
    })

    // 等待第一个成功的响应
    try {
      const result = await Promise.any(promises)
      return result
    } catch {
      console.log('❌ 所有公网IP服务都无法访问')
      return null
    }
  }

  /**
   * 解析不同服务的IP响应格式
   */
  parseIpResponse(serviceUrl, text) {
    try {
      // 处理不同服务的响应格式
      if (serviceUrl.includes('myip.com')) {
        const data = JSON.parse(text)
        return data.ip
      } else if (serviceUrl.includes('httpbin.org')) {
        const data = JSON.parse(text)
        return data.origin
      } else {
        // Ipify.org, ipinfo.io, icanhazip.com 直接返回IP
        return text.trim()
      }
    } catch (error) {
      console.error(`⚠️ 解析IP响应失败: ${serviceUrl}`, error.message)
      return null
    }
  }

  /**
   * 验证IP地址格式
   */
  isValidIp(ip) {
    if (!ip || typeof ip !== 'string') return false

    // IPv4正则表达式
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d{1,2})\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d{1,2})$/

    // IPv6正则表达式（简化版）
    const ipv6Regex = /^(?:[\da-fA-F]{1,4}:){7}[\da-fA-F]{1,4}$/

    return ipv4Regex.test(ip.trim()) || ipv6Regex.test(ip.trim())
  }

  /**
   * 获取当前连接的WiFi信息（带超时处理）
   */
  async getWifiInfo() {
    try {
      // 设置超时：最多等待配置的时间获取WiFi信息
      const wifiPromise = si.wifiConnections()
      const timeoutPromise = new Promise((_resolve, reject) => {
        setTimeout(() => reject(new Error('WiFi info timeout')), this.constants.wifiTimeout)
      })

      const wifiConnections = await Promise.race([wifiPromise, timeoutPromise])

      if (wifiConnections && wifiConnections.length > 0) {
        // 找到当前活动的WiFi连接
        const activeWifi = wifiConnections.find((wifi) => wifi.active) || wifiConnections[0]

        return {
          ssid: activeWifi.ssid || null,
          signal: activeWifi.signalLevel || null,
          frequency: activeWifi.frequency || null,
          type: activeWifi.type || null
        }
      }

      return {
        ssid: null,
        signal: null,
        frequency: null,
        type: null
      }
    } catch (error) {
      console.error('⚠️ 获取WiFi信息失败:', error.message)
      return {
        ssid: null,
        signal: null,
        frequency: null,
        type: null
      }
    }
  }

  /**
   * 获取本地 IP（首个非内网无效地址优先，退化为首个 IPv4）
   */
  async getLocalIp() {
    try {
      const interfaces = os.networkInterfaces()
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] || []) {
          if (!iface.internal && iface.family === 'IPv4') {
            return iface.address
          }
        }
      }

      return null
    } catch {
      return null
    }
  }

  /**
   * 获取 MAC 列表
   */
  async getMacAddresses() {
    try {
      const interfaces = os.networkInterfaces()
      const macs = new Set()
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] || []) {
          if (iface.mac && iface.mac !== '00:00:00:00:00:00') macs.add(iface.mac)
        }
      }

      return [...macs]
    } catch {
      return []
    }
  }

  // 在拿到 deployPath 后，计算 storage 与回滚能力并上报
  async updateSystemInfoAfterRegistration(deployPath) {
    if (!deployPath || typeof deployPath !== 'string') {
      console.error('❌ 更新系统信息: 部署路径参数无效')
      return
    }

    try {
      console.log('🔧 开始更新系统信息，使用部署路径:', deployPath)

      // 直接使用传入的路径，该路径应该已经通过安全验证
      const safeDeployPath = path.resolve(deployPath)

      const diskInfo = await this.getDiskInfoByPath(safeDeployPath)
      const writable = await this.checkWritable(safeDeployPath)
      const rollbackAvailable = await this.checkRollbackAvailable()

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
          uptimeSeconds: Math.floor(process.uptime())
        }
      }

      console.log('📊 系统信息收集完成:', {
        diskFreeBytes: diskInfo?.free ?? null,
        writable,
        rollbackAvailable,
        arch: this.config.device.arch
      })

      if (this.socket && this.socket.connected) {
        this.socket.emit('device:update-system', payload)
        console.log('✅ 系统信息已发送到服务器')
      } else {
        console.log('⚠️ Socket未连接，无法发送系统信息')
      }
    } catch (error) {
      console.error('❌ 更新系统信息失败:', error.message)
    }
  }

  async getDiskInfoByPath(targetPath) {
    if (!targetPath || typeof targetPath !== 'string') {
      console.error('❌ 获取磁盘信息: 路径参数无效')
      return null
    }

    try {
      const fsSize = await si.fsSize()
      // 简单匹配：找到包含路径的分区
      const match = fsSize.find((v) => targetPath.startsWith(v.mount))
      return match ? { free: match.available, total: match.size, mount: match.mount } : null
    } catch (error) {
      console.error('⚠️ 获取磁盘信息失败:', error.message)
      return null
    }
  }

  async checkWritable(targetPath) {
    if (!targetPath || typeof targetPath !== 'string') {
      console.error('❌ 检查写权限: 路径参数无效')
      return null
    }

    try {
      const testFile = path.join(targetPath, `.rwtest-${Date.now()}`)
      await fs.outputFile(testFile, 'test')
      await fs.remove(testFile)
      return true
    } catch (error) {
      console.error(`⚠️ 检查目录写权限失败: ${targetPath}`, error.message)
      return false
    }
  }

  async checkRollbackAvailable() {
    try {
      const { backupDir } = this.config.deploy
      if (!backupDir) return null
      const exists = await fs.pathExists(backupDir)
      if (!exists) return false
      const files = await fs.readdir(backupDir)
      return files && files.length > 0
    } catch (error) {
      console.error('⚠️ 检查回滚可用性失败:', error.message)
      return null
    }
  }

  /**
   * 初始化设备唯一标识符
   */
  async initializeDeviceId() {
    try {
      console.log('🔧 初始化设备唯一标识符...')

      // 优先使用环境变量中的设备ID (用于测试和手动指定)
      if (process.env.DEVICE_ID) {
        console.log('📝 使用环境变量中的设备ID:', process.env.DEVICE_ID)
        this.config.device.id = process.env.DEVICE_ID
        return
      }

      // 使用智能设备ID生成器
      const deviceIdGenerator = new DeviceIdGenerator()
      const deviceId = await deviceIdGenerator.generateDeviceId()

      this.config.device.id = deviceId
      console.log('✅ 设备ID已初始化:', deviceId)

      // 获取设备详细信息用于调试和日志
      const deviceInfo = await deviceIdGenerator.getDeviceInfo()
      console.log('📊 设备信息:', {
        manufacturer: deviceInfo.manufacturer,
        model: deviceInfo.model,
        platform: deviceInfo.platform,
        hostname: deviceInfo.hostname,
        arch: deviceInfo.arch
      })
    } catch (error) {
      console.error('❌ 初始化设备ID失败:', error)
      // Fallback到时间戳ID
      const fallbackId = `device-fallback-${Date.now()}`
      this.config.device.id = fallbackId
      console.log('⚠️ 使用fallback设备ID:', fallbackId)
    }
  }
  // 确保必要目录存在
  async ensureDirectories() {
    const dirs = [
      this.config.download.tempDir,
      this.config.download.packageDir,
      this.config.deploy.frontendDir,
      this.config.deploy.backendDir,
      this.config.deploy.backupDir,
      path.dirname(this.config.log.file)
    ]

    try {
      // 并行创建所有目录，提高性能
      await Promise.all(dirs.map((dir) => fs.ensureDir(dir)))
      console.log('✅ 目录结构初始化完成')
    } catch (error) {
      console.error('❌ 目录创建失败:', error)
      throw error
    }
  }

  // 获取下载管理器
  getDownloadManager() {
    return this.downloadManager
  }

  // 获取部署管理器
  getDeployManager() {
    return this.deployManager
  }

  // 发送设备状态
  reportStatus(status) {
    if (!status || typeof status !== 'string') {
      console.error('❌ 设备状态参数无效')
      return
    }

    try {
      if (this.isConnected && this.socket) {
        this.socket.emit('device:status', {
          deviceId: this.config.device.id,
          status,
          timestamp: DateHelper.getCurrentDate()
        })
      } else {
        console.log('⚠️ Socket未连接，无法发送设备状态')
      }
    } catch (error) {
      console.error('❌ 发送设备状态失败:', error.message)
    }
  }

  // 断开连接
  disconnect() {
    try {
      console.log('🔌 正在断开连接...')
      this.cleanup()
      console.log('✅ 连接已断开')
    } catch (error) {
      console.error('❌ 断开连接时发生错误:', error.message)
    }
  }

  // 统一资源清理
  cleanup() {
    // 清理定时器
    this.clearReconnectTimer()

    // 清理 Socket 连接
    if (this.socket) {
      try {
        this.socket.removeAllListeners()
        this.socket.disconnect()
        this.socket.close()
      } catch (error) {
        console.error('⚠️ 清理Socket时发生错误:', error.message)
      }
      this.socket = null
    }

    // 清理状态
    this.isConnected = false
    this.isRegistered = false
    this.reconnectAttempts = 0

    // 清理处理器
    if (this.socketHandler) {
      try {
        if (this.socketHandler.cleanup) {
          this.socketHandler.cleanup()
        }
      } catch (error) {
        console.error('⚠️ 清理SocketHandler时发生错误:', error.message)
      }
      this.socketHandler = null
    }

    // 清理下载管理器
    if (this.downloadManager) {
      try {
        if (this.downloadManager.cleanup) {
          this.downloadManager.cleanup()
        }
      } catch (error) {
        console.error('⚠️ 清理DownloadManager时发生错误:', error.message)
      }
      this.downloadManager = null
    }

    // 清理部署管理器
    if (this.deployManager) {
      try {
        if (this.deployManager.cleanup) {
          this.deployManager.cleanup()
        }
      } catch (error) {
        console.error('⚠️ 清理DeployManager时发生错误:', error.message)
      }
      this.deployManager = null
    }

    // 清理并发控制的Promise引用
    this.registerPromise = null
    this.networkUpdatePromise = null
  }

  // 优雅关闭
  async gracefulShutdown() {
    try {
      console.log('🔄 开始优雅关闭设备代理...')

      // 发送离线状态（带超时保护）
      if (this.isConnected && this.socket) {
        try {
          this.reportStatus('offline')
          // 等待状态发送完成，但不超过1秒
          await Promise.race([
            new Promise((resolve) => setTimeout(resolve, this.constants.statusSendDelay)),
            new Promise((resolve) => setTimeout(resolve, 1000))
          ])
        } catch (error) {
          console.error('⚠️ 发送离线状态失败:', error.message)
        }
      }

      // 清理所有资源
      this.cleanup()

      console.log('✅ 优雅关闭完成')
    } catch (error) {
      console.error('❌ 优雅关闭时发生错误:', error.message)
      // 强制清理
      this.cleanup()
      throw error
    }
  }
}
