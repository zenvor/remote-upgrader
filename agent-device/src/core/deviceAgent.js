// 中文注释：ESM 导入
import fs from 'fs-extra'
import { execSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { io } from 'socket.io-client'
import si from 'systeminformation'
import DeployManager from '../services/deployManager.js'
import DownloadManager from '../services/downloadManager.js'
import { DateHelper } from '../utils/common.js'
import DeviceIdGenerator from '../utils/deviceId.js'
import logger from '../utils/logger.js'
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
    this.currentOperationStatus = 'idle' // 当前操作状态：idle, upgrading, rolling_back
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
    logger.info(`开始连接服务器: ${this.config.server.url}`)

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
        logger.warn('连接超时，将启动指数退避重连')
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
    logger.info(isReconnection ? '已重新连接到服务器' : '成功连接升级服务器')

    this.isConnected = true
    this.clearReconnectTimer() // 清除重连定时器
    this.reconnectAttempts = 0 // 重置重连计数（在清除定时器后）

    // 连接后都需要注册（初次连接或重连）
    this.registerDevice()
  }

  onDisconnected() {
    logger.warn('与服务器连接断开')
    this.isConnected = false
    this.isRegistered = false // 断开连接时重置注册状态

    // 开始指数退避重连
    this.scheduleReconnect()
  }

  handleConnectionError(error) {
    const errorMessage = this.getErrorMessage(error)
    logger.warn(`连接失败: ${errorMessage}`)
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
      logger.warn(`达到最大重连次数 (${this.config.server.maxReconnectAttempts})，进入长时间等待模式`)
      // 达到最大次数后，使用最大延迟继续尝试（类似 GMS）
      this.reconnectAttempts = this.config.server.maxReconnectAttempts - 1
    }

    // 指数退避算法：delay = baseDelay * (2 ^ attempts) + 随机抖动
    const exponentialDelay = this.baseReconnectDelay * 2 ** this.reconnectAttempts
    const jitter = Math.random() * this.constants.jitterRange
    const finalDelay = Math.min(exponentialDelay + jitter, this.maxReconnectDelay)

    this.reconnectAttempts++

    logger.debug(`将在 ${Math.round(finalDelay / 1000)} 秒后重试连接 (第 ${this.reconnectAttempts} 次)`)

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.attemptReconnect()
    }, finalDelay)
  }

  async attemptReconnect() {
    if (!this.isConnected && this.socket) {
      logger.debug('正在发起重连')
      try {
        this.socket.connect()
      } catch (error) {
        logger.error('重连尝试失败:', error.message)
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
      logger.debug('注册操作已在进行中，等待完成')
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
      const configuredName = (this.config.device.name || '').trim()
      const hasCustomConfigName = configuredName && configuredName !== '未知设备'
      const preferConfigName = this.config.device.preferConfigName && hasCustomConfigName

      const basicDeviceInfo = {
        deviceId: this.config.device.id,
        deviceName: preferConfigName
          ? configuredName // 优先使用配置的设备名称
          : systemHostname || configuredName || '未知设备', // 优先使用系统主机名，退化为配置/默认名
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
          localIp: null,
          macAddresses: []
        },
        timestamp: DateHelper.getCurrentDate()
      }

      logger.info(`注册设备信息: ${basicDeviceInfo.deviceId} (${basicDeviceInfo.deviceName})`)
      logger.debug('注册载荷:', basicDeviceInfo)
      this.socket.emit('device:register', basicDeviceInfo)
      this.isRegistered = true

      // 异步获取网络信息并更新
      this.updateNetworkInfo()
    } catch (error) {
      logger.error('设备注册失败:', error.message)
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
      logger.debug('网络信息更新已在进行中，跳过本次请求')
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
      // 并行获取WiFi、本地地址和MAC（带超时保护）
      const networkInfoPromise = Promise.all([this.getWifiInfo(), this.getLocalIp(), this.getMacAddresses()])

      let timeoutId = null
      const timeoutPromise = new Promise((_resolve, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Network info update timeout')),
          this.constants.networkUpdateTimeout
        )
      })

      try {
        const [wifiInfo, localIp, macAddresses] = await Promise.race([networkInfoPromise, timeoutPromise])

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
              localIp,
              macAddresses
            },
            timestamp: DateHelper.getCurrentDate()
          }

          logger.info('网络信息已更新', {
            wifi: wifiInfo?.ssid || '无WiFi连接',
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
      logger.warn('更新网络信息失败:', error.message)
    }
  }

  async updateWifiInfo() {
    try {
      const wifiInfo = await this.getWifiInfo()
      if (wifiInfo.ssid && this.socket && this.socket.connected) {
        logger.debug(`更新 WiFi 信息: ${wifiInfo.ssid}`)
        this.socket.emit('device:update-wifi', {
          deviceId: this.config.device.id,
          wifiName: wifiInfo.ssid,
          timestamp: DateHelper.getCurrentDate()
        })
      }
    } catch (error) {
      logger.warn('更新 WiFi 信息失败:', error.message)
    }
  }

  /**
   * 获取系统主机名/设备名称
   */
  async getSystemHostname() {
    try {
      const baseHostname = await this.getBaseHostname()
      if (!baseHostname) {
        logger.warn('无法获取系统主机名，将使用配置名称')
        return null
      }

      // 如果配置要求使用真实主机名，则不添加后缀
      if (this.config.device.useRealHostname) {
        logger.debug(`使用真实主机名（无后缀）: ${baseHostname}`)
        return baseHostname
      }

      return this.generateDeviceName(baseHostname)
    } catch (error) {
      logger.warn('获取系统主机名失败:', error.message)
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

    // 方法2.1：Windows 命令行/PowerShell 获取
    const windowsCommandHostname = this.getHostnameFromWindowsCommand()
    if (windowsCommandHostname) return windowsCommandHostname

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
        logger.debug(`从系统信息获取主机名: ${hostname}`)
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
        const normalized = hostname.trim()
        const lower = normalized.toLowerCase()
        if (lower !== 'localhost' && lower !== 'localhost.localdomain') {
          const cleanedHostname = this.cleanHostname(normalized)
          logger.debug(`从 OS 模块获取主机名: ${cleanedHostname}`)
          return cleanedHostname
        }
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
      const lower = hostname.toLowerCase()
      if (lower !== 'localhost' && lower !== 'localhost.localdomain') {
        logger.debug(`从环境变量获取主机名: ${hostname}`)
        return hostname
      }
    }
    return null
  }

  // 中文注释：在 Windows 平台上通过系统命令获取主机名，作为额外兜底
  getHostnameFromWindowsCommand() {
    if (process.platform !== 'win32') {
      return null
    }

    try {
      const commandHostname = execSync('hostname', { encoding: 'utf8', timeout: 2000 }).trim()
      if (commandHostname) {
        const cleaned = this.cleanHostname(commandHostname)
        logger.debug(`通过 hostname 命令获取主机名: ${cleaned}`)
        return cleaned
      }
    } catch (error) {
      logger.debug('Windows hostname 命令获取主机名失败:', error.message)
    }

    try {
      const powershellHostname = execSync(
        'powershell -NoProfile -Command "(Get-CimInstance -ClassName Win32_ComputerSystem).Name"',
        { encoding: 'utf8', timeout: 4000 }
      )
        .replace(/\r?\n/g, '')
        .trim()

      if (powershellHostname) {
        const cleaned = this.cleanHostname(powershellHostname)
        logger.debug(`通过 PowerShell 获取主机名: ${cleaned}`)
        return cleaned
      }
    } catch (error) {
      logger.debug('PowerShell 获取主机名失败:', error.message)
    }

    return null
  }

  getHostnameFromUser() {
    try {
      const userInfo = os.userInfo()
      if (userInfo.username) {
        // 根据平台生成合适的设备类型后缀
        const deviceType = this.getDeviceTypeByPlatform()

        // 优先使用中文设备名，如果用户名看起来是英文名则使用"的设备"
        const isEnglishName = /^[a-zA-Z\s]+$/.test(userInfo.username)
        const hostname = isEnglishName ? `${userInfo.username}的${deviceType}` : `${userInfo.username}的设备`
        logger.debug(`根据用户名生成设备名: ${hostname}`)
        return hostname
      }
    } catch {
      // 忽略错误
    }
    return null
  }

  /**
   * 根据平台获取设备类型名称
   */
  getDeviceTypeByPlatform() {
    switch (process.platform) {
      case 'darwin':
        // macOS 系统，尝试检测是否为 MacBook
        return this.getMacDeviceType()
      case 'win32':
        return 'Windows电脑'
      case 'linux':
        return 'Linux设备'
      default:
        return '设备'
    }
  }

  /**
   * 获取 Mac 设备类型
   */
  getMacDeviceType() {
    try {
      // 尝试通过系统信息获取具体的 Mac 型号
      const model = execSync('sysctl -n hw.model', { encoding: 'utf8', timeout: 2000 }).trim()

      if (model.includes('MacBook')) {
        if (model.includes('Air')) {
          return 'MacBook Air'
        } else if (model.includes('Pro')) {
          return 'MacBook Pro'
        } else {
          return 'MacBook'
        }
      } else if (model.includes('iMac')) {
        return 'iMac'
      } else if (model.includes('Mac')) {
        if (model.includes('mini')) {
          return 'Mac mini'
        } else if (model.includes('Studio')) {
          return 'Mac Studio'
        } else if (model.includes('Pro')) {
          return 'Mac Pro'
        } else {
          return 'Mac'
        }
      }

      // 如果无法识别，返回通用名称
      return 'Mac设备'
    } catch (error) {
      logger.warn('获取 Mac 设备类型失败:', error.message)
      return 'Mac设备'
    }
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
      logger.debug(`多实例设备名: ${deviceName}`)
      return deviceName
    }

    // 使用进程ID作为区分
    const deviceName = `${baseHostname}-${process.pid}`
    logger.debug(`使用进程 ID 区分的设备名: ${deviceName}`)
    return deviceName
  }

  /**
   * 获取当前连接的WiFi信息（带超时处理和多种策略）
   */
  async getWifiInfo() {
    try {
      // 直接使用原生系统命令获取 WiFi 信息
      logger.debug('尝试使用原生命令获取 WiFi 信息')
      const nativeResult = await this.getWifiInfoFromNativeCommand()

      if (nativeResult && nativeResult.ssid) {
        logger.debug(`原生命令获取到 WiFi: ${nativeResult.ssid}`)
        return nativeResult
      }

      // 如果获取失败，返回空结果
      logger.warn('未获取到 WiFi 信息')
      return {
        ssid: null,
        frequency: null,
        type: null
      }
    } catch (error) {
      logger.warn('获取 WiFi 信息失败:', error.message)
      return {
        ssid: null,
        frequency: null,
        type: null
      }
    }
  }

  /**
   * 通过原生系统命令获取 WiFi 信息
   */
  async getWifiInfoFromNativeCommand() {
    try {
      if (process.platform === 'darwin') {
        return await this.getWifiInfoMacOS()
      } else if (process.platform === 'win32') {
        return await this.getWifiInfoWindows()
      } else if (process.platform === 'linux') {
        return await this.getWifiInfoLinux()
      }

      return null
    } catch (error) {
      logger.debug('原生命令获取 WiFi 信息失败:', error.message)
      return null
    }
  }

  /**
   * macOS 系统获取 WiFi 信息
   */
  async getWifiInfoMacOS() {
    try {
      const { execSync } = await import('child_process')

      // 策略1：尝试使用新的 wdutil 命令
      try {
        const wdutilResult = execSync('wdutil info', {
          encoding: 'utf8',
          timeout: this.constants.wifiTimeout
        })

        // 解析 wdutil 输出获取 SSID
        const ssidMatch = wdutilResult.match(/\s*SSID\s*:\s*(.+)/)
        if (ssidMatch) {
          const ssid = ssidMatch[1].trim()

          return {
            ssid,
            frequency: null,
            type: null
          }
        }
      } catch {
        logger.debug('wdutil 命令失败，尝试备用方法')
      }

      // 策略2：尝试使用 networksetup 命令
      try {
        const networkResult = execSync('networksetup -getairportnetwork en0', {
          encoding: 'utf8',
          timeout: this.constants.wifiTimeout
        })

        // 解析输出 "Current Wi-Fi Network: NetworkName"
        const networkMatch = networkResult.match(/Current Wi-Fi Network:\s*(.+)/)
        if (networkMatch) {
          const ssid = networkMatch[1].trim()
          return {
            ssid,
            frequency: null,
            type: null
          }
        }
      } catch {
        logger.debug('networksetup 命令失败，尝试 airport 命令')
      }

      // 策略3：作为最后手段使用废弃的 airport 命令（忽略警告）
      try {
        const ssidResult = execSync(
          '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I',
          {
            encoding: 'utf8',
            timeout: this.constants.wifiTimeout
          }
        )

        // 解析输出获取 SSID
        const ssidMatch = ssidResult.match(/\s*SSID:\s*(.+)/)
        const ssid = ssidMatch ? ssidMatch[1].trim() : null

        if (!ssid) {
          return null
        }

        return {
          ssid,
          frequency: null,
          type: null
        }
      } catch {
        logger.warn('所有 macOS WiFi 命令均失败')
      }

      return null
    } catch (error) {
      logger.warn('macOS WiFi 命令执行失败:', error.message)
      return null
    }
  }

  /**
   * Windows 系统获取 WiFi 信息
   */
  async getWifiInfoWindows() {
    try {
      const { execSync } = await import('child_process')

      // 直接获取当前活动的WiFi接口信息
      const interfaceResult = execSync('netsh wlan show interfaces', {
        encoding: 'utf8',
        timeout: this.constants.wifiTimeout
      })

      logger.debug('Windows netsh 输出片段:', interfaceResult.substring(0, 200) + '...')

      // 检查是否有WiFi适配器连接
      if (!interfaceResult.includes('SSID') || interfaceResult.includes('There is no profile assigned')) {
        logger.warn('Windows WiFi: 未检测到连接或适配器')
        return null
      }

      const ssidMatch = interfaceResult.match(/\s*SSID\s*:\s*(.+)/)
      const ssid = ssidMatch ? ssidMatch[1].trim() : null

      if (!ssid || ssid === '') {
        logger.warn('Windows WiFi: SSID 为空或未找到')
        return null
      }

      logger.debug(`Windows WiFi 成功获取 SSID: ${ssid}`)

      return {
        ssid,
        frequency: null,
        type: null
      }
    } catch (error) {
      logger.warn('Windows WiFi 命令执行失败:', error.message)
      return null
    }
  }

  /**
   * Linux 系统获取 WiFi 信息
   */
  async getWifiInfoLinux() {
    try {
      const { execSync } = await import('child_process')

      // 尝试使用 iwgetid 获取 SSID
      let ssid = null
      try {
        const ssidResult = execSync('iwgetid -r', {
          encoding: 'utf8',
          timeout: this.constants.wifiTimeout
        })
        ssid = ssidResult.trim()
      } catch (error) {
        // 如果 iwgetid 失败，尝试 nmcli
        try {
          const nmcliResult = execSync('nmcli -t -f active,ssid dev wifi | grep "yes"', {
            encoding: 'utf8',
            timeout: this.constants.wifiTimeout
          })
          const parts = nmcliResult.trim().split(':')
          if (parts.length > 1) {
            ssid = parts[1]
          }
        } catch (nmcliError) {
          logger.debug('Linux WiFi 命令均失败:', error.message, nmcliError.message)
          return null
        }
      }

      if (!ssid) {
        return null
      }

      return {
        ssid,
        frequency: null,
        type: null
      }
    } catch (error) {
      logger.warn('Linux WiFi 命令执行失败:', error.message)
      return null
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
  async updateSystemInfoAfterRegistration() {
    try {
      logger.info('开始更新系统信息')

      // 获取基础系统信息，不进行存储检查

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
        deploy: {
          rollbackAvailable
        },
        health: {
          uptimeSeconds: Math.floor(process.uptime())
        }
      }

      logger.info('系统信息已收集', {
        rollbackAvailable,
        arch: this.config.device.arch
      })

      if (this.socket && this.socket.connected) {
        this.socket.emit('device:update-system', payload)
        logger.info('系统信息已发送到服务器')
      } else {
        logger.warn('Socket 未连接，无法发送系统信息')
      }
    } catch (error) {
      logger.error('更新系统信息失败:', error.message)
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
      logger.warn('检查回滚可用性失败:', error.message)
      return null
    }
  }

  /**
   * 初始化设备唯一标识符
   */
  async initializeDeviceId() {
    try {
      logger.info('初始化设备唯一标识符...')

      // 优先使用环境变量中的设备ID (用于测试和手动指定)
      if (process.env.DEVICE_ID) {
        logger.info(`使用环境变量中的设备 ID: ${process.env.DEVICE_ID}`)
        this.config.device.id = process.env.DEVICE_ID
        return
      }

      // 使用智能设备ID生成器
      const deviceIdGenerator = new DeviceIdGenerator()
      const deviceId = await deviceIdGenerator.generateDeviceId()

      this.config.device.id = deviceId
      logger.info(`设备 ID 已初始化: ${deviceId}`)

      // 获取设备详细信息用于调试和日志
      const deviceInfo = await deviceIdGenerator.getDeviceInfo()
      logger.debug('设备基础信息', {
        manufacturer: deviceInfo.manufacturer,
        model: deviceInfo.model,
        platform: deviceInfo.platform,
        hostname: deviceInfo.hostname,
        arch: deviceInfo.arch
      })
    } catch (error) {
      logger.error('初始化设备 ID 失败:', error)
      // Fallback到时间戳ID
      const fallbackId = `device-fallback-${Date.now()}`
      this.config.device.id = fallbackId
      logger.warn(`使用 fallback 设备 ID: ${fallbackId}`)
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
      logger.info('目录结构初始化完成')
    } catch (error) {
      logger.error('目录创建失败:', error)
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
      logger.warn('设备状态参数无效')
      return
    }

    // 更新内部操作状态
    this.currentOperationStatus =
      status === 'upgrading' ? 'upgrading' : status === 'rolling_back' ? 'rolling_back' : 'idle'

    try {
      if (this.isConnected && this.socket) {
        this.socket.emit('device:status', {
          deviceId: this.config.device.id,
          status,
          timestamp: DateHelper.getCurrentDate()
        })
      } else {
        logger.warn('Socket 未连接，无法发送设备状态')
      }
    } catch (error) {
      logger.warn('发送设备状态失败:', error.message)
    }
  }

  // 检查是否可以执行操作
  canPerformOperation() {
    if (this.currentOperationStatus === 'idle') {
      return { canPerform: true }
    }

    return {
      canPerform: false,
      reason: `设备正在执行${this.currentOperationStatus === 'upgrading' ? '升级' : '回滚'}操作，请稍后重试`
    }
  }

  // 断开连接
  disconnect() {
    try {
      logger.info('正在断开连接...')
      this.cleanup()
      logger.info('连接已断开')
    } catch (error) {
      logger.warn('断开连接时发生错误:', error.message)
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
        logger.warn('清理 Socket 时发生错误:', error.message)
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
        logger.warn('清理 SocketHandler 时发生错误:', error.message)
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
        logger.warn('清理 DownloadManager 时发生错误:', error.message)
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
        logger.warn('清理 DeployManager 时发生错误:', error.message)
      }
      this.deployManager = null
    }

    // 清理并发控制的Promise引用
    this.registerPromise = null
    this.networkUpdatePromise = null
  }
}
