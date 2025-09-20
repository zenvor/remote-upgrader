// 中文注释：ESM 导入
// 中文注释：node-machine-id 为 CommonJS 模块，ESM 下需默认导入再解构
import path from 'node:path'
import crypto from 'node:crypto'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import fs from 'fs-extra'
import si from 'systeminformation'
import machineIdModule from 'node-machine-id'
import { DateHelper } from './common.js'

const { machineId, machineIdSync } = machineIdModule

export default class DeviceIdGenerator {
  constructor() {
    // 中文注释：ESM 环境下构造 __dirname
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)

    // 为支持多实例，根据实例ID使用不同的配置文件
    const instanceId = process.env.AGENT_INSTANCE_ID
    const configFileName = instanceId ? `device-info-${instanceId}.json` : 'device-info.json'
    this.deviceIdFile = path.join(__dirname, '../../config', configFileName)
  }

  /**
   * 获取设备唯一标识符
   * 按优先级尝试多种方法，确保设备重启后ID保持不变
   */
  async generateDeviceId() {
    try {
      // 首先尝试从本地文件读取已保存的设备ID
      const savedId = await this.loadSavedDeviceId()
      if (savedId) {
        console.log('🔍 使用已保存的设备ID:', savedId)
        return savedId
      }

      console.log('🔧 正在生成新的设备唯一标识符...')

      // 方法1: 获取机器UUID (最推荐)
      const machineUuid = await this.getMachineId()
      if (machineUuid) {
        const deviceId = this.formatDeviceId('machine', machineUuid)
        await this.saveDeviceId(deviceId, 'machine-uuid', machineUuid)
        return deviceId
      }

      // 方法2: 获取主板信息
      const boardInfo = await this.getBoardInfo()
      if (boardInfo) {
        const deviceId = this.formatDeviceId('board', boardInfo)
        await this.saveDeviceId(deviceId, 'board-info', boardInfo)
        return deviceId
      }

      // 方法3: 获取网络接口MAC地址
      const macInfo = await this.getPrimaryMacAddress()
      if (macInfo) {
        const deviceId = this.formatDeviceId('mac', macInfo)
        await this.saveDeviceId(deviceId, 'mac-address', macInfo)
        return deviceId
      }

      // 方法4: 生成基于系统信息的唯一标识
      const systemId = await this.generateSystemBasedId()
      const deviceId = this.formatDeviceId('system', systemId)
      await this.saveDeviceId(deviceId, 'system-generated', systemId)
      return deviceId
    } catch (error) {
      console.error('❌ 生成设备ID时出错:', error)
      // 最后的fallback：生成随机ID并保存
      const fallbackId = this.generateFallbackId()
      await this.saveDeviceId(fallbackId, 'fallback', 'random-generated')
      return fallbackId
    }
  }

  /**
   * 方法1: 获取机器唯一ID
   */
  async getMachineId() {
    try {
      const id = await machineId()
      console.log('✅ 获取到机器UUID:', id.slice(0, 8) + '...')
      return id
    } catch {
      try {
        // 尝试同步版本
        const id = machineIdSync()
        console.log('✅ 获取到机器UUID (同步):', id.slice(0, 8) + '...')
        return id
      } catch (syncError) {
        console.log('⚠️ 无法获取机器UUID:', syncError.message)
        return null
      }
    }
  }

  /**
   * 方法2: 获取主板信息
   */
  async getBoardInfo() {
    try {
      // 定义无效标识符黑名单
      const INVALID_IDENTIFIERS = new Set([
        'not specified',
        'unknown',
        'to be filled by o.e.m.',
        'default string',
        'system serial number',
        '00000000-0000-0000-0000-000000000000',
        'none',
        'oem',
        'system manufacturer',
        'system product name',
        'system version',
        'chassisassetag',
        'asset-1234567890'
      ])

      // 创建校验函数
      const isValidIdentifier = (id) => {
        if (!id) return false
        const normalizedId = id.toLowerCase().trim()
        return normalizedId && !INVALID_IDENTIFIERS.has(normalizedId)
      }

      const system = await si.system()
      const baseboard = await si.baseboard()

      // 优先使用主板序列号
      if (isValidIdentifier(baseboard.serial)) {
        console.log('✅ 获取到有效的主板序列号')
        return baseboard.serial
      }

      // 使用主板UUID
      if (isValidIdentifier(baseboard.uuid)) {
        console.log('✅ 获取到有效的主板UUID')
        return baseboard.uuid
      }

      // 使用系统UUID
      if (isValidIdentifier(system.uuid)) {
        console.log('✅ 获取到有效的系统UUID')
        return system.uuid
      }

      console.log('⚠️ 未找到可用的主板/系统标识符')
      return null
    } catch (error) {
      console.log('⚠️ 获取主板信息失败:', error.message)
      return null
    }
  }

  /**
   * 方法3: 获取主要网络接口的MAC地址
   */
  async getPrimaryMacAddress() {
    try {
      const networkInterfaces = await si.networkInterfaces()

      // 查找主要的物理网络接口
      const primaryInterface = networkInterfaces.find(
        (iface) =>
          !iface.virtual &&
          !iface.internal &&
          iface.mac &&
          iface.mac !== '00:00:00:00:00:00' &&
          (iface.type === 'wired' || iface.type === 'wireless')
      )

      if (primaryInterface) {
        console.log('✅ 获取到主网卡MAC地址')
        return primaryInterface.mac
      }

      // 备选：使用第一个非虚拟接口
      const firstPhysical = networkInterfaces.find(
        (iface) => !iface.virtual && !iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00'
      )

      if (firstPhysical) {
        console.log('✅ 获取到网卡MAC地址 (备选)')
        return firstPhysical.mac
      }

      console.log('⚠️ 未找到可用的物理网络接口')
      return null
    } catch (error) {
      console.log('⚠️ 获取网络接口失败:', error.message)
      return null
    }
  }

  /**
   * 方法4: 基于系统信息生成唯一标识
   */
  async generateSystemBasedId() {
    try {
      const system = await si.system()
      const os_info = await si.osInfo()
      const cpu = await si.cpu()

      // 组合多个系统信息创建唯一标识
      const components = [
        system.manufacturer || 'unknown',
        system.model || 'unknown',
        system.version || 'unknown',
        os_info.platform || 'unknown',
        os_info.hostname || 'unknown',
        cpu.manufacturer || 'unknown',
        cpu.brand || 'unknown'
      ]

      const combined = components.join('|')
      const hash = crypto.createHash('sha256').update(combined).digest('hex')

      console.log('✅ 基于系统信息生成ID:', hash.slice(0, 16) + '...')
      return hash.slice(0, 32) // 取前32位
    } catch (error) {
      console.log('⚠️ 生成系统ID失败:', error.message)
      throw error
    }
  }

  /**
   * 格式化设备ID
   * 使用SHA256哈希确保隐私保护和格式统一
   */
  formatDeviceId(type, rawId) {
    // 只使用硬件标识，不包含进程相关信息，确保设备ID持久不变
    // 为了支持同一机器上的多个agent实例，只使用AGENT_INSTANCE_ID（如果设置）
    const instanceId = process.env.AGENT_INSTANCE_ID
    const combinedId = instanceId ? `${rawId}-${instanceId}` : rawId

    // 使用SHA256哈希保护隐私，避免暴露原始硬件信息
    const hash = crypto.createHash('sha256').update(combinedId).digest('hex')
    return `device-${type}-${hash.slice(0, 16)}`
  }

  /**
   * 生成fallback设备ID
   * 基于主机名和架构信息，确保在同一台机器上保持一致
   */
  generateFallbackId() {
    const hostname = os.hostname()
    const platform = os.platform()
    const arch = os.arch()
    const instanceId = process.env.AGENT_INSTANCE_ID

    // 使用相对稳定的系统信息，避免使用时间戳和随机数
    const combined = instanceId ? `${hostname}-${platform}-${arch}-${instanceId}` : `${hostname}-${platform}-${arch}`

    const hash = crypto.createHash('sha256').update(combined).digest('hex')

    console.log('⚠️ 使用fallback设备ID（基于主机名和系统信息）')
    return `device-fallback-${hash.slice(0, 16)}`
  }

  /**
   * 保存设备ID到本地文件
   */
  async saveDeviceId(deviceId, method, rawValue) {
    try {
      const deviceInfo = {
        deviceId,
        method,
        rawValue: rawValue.slice(0, 100), // 限制长度防止敏感信息泄露
        generatedAt: DateHelper.getCurrentDate(),
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch()
      }

      await fs.writeJson(this.deviceIdFile, deviceInfo, { spaces: 2 })
      console.log('💾 设备ID已保存到本地文件')
    } catch (error) {
      console.warn('⚠️ 保存设备ID失败:', error.message)
    }
  }

  /**
   * 从本地文件读取已保存的设备ID
   */
  async loadSavedDeviceId() {
    try {
      if (await fs.pathExists(this.deviceIdFile)) {
        const deviceInfo = await fs.readJson(this.deviceIdFile)

        // 验证设备ID的有效性
        if (deviceInfo.deviceId && deviceInfo.deviceId.startsWith('device-')) {
          return deviceInfo.deviceId
        }
      }

      return null
    } catch (error) {
      console.log('⚠️ 读取设备ID文件失败:', error.message)
      return null
    }
  }

  /**
   * 获取设备详细信息
   */
  async getDeviceInfo() {
    try {
      const system = await si.system()
      const osInfo = await si.osInfo()
      const networkInterfaces = await si.networkInterfaces()

      return {
        manufacturer: system.manufacturer,
        model: system.model,
        version: system.version,
        platform: osInfo.platform,
        hostname: osInfo.hostname,
        arch: osInfo.arch,
        networkInterfaces: networkInterfaces.map((iface) => ({
          name: iface.iface,
          mac: iface.mac,
          type: iface.type,
          virtual: iface.virtual
        }))
      }
    } catch (error) {
      console.warn('获取设备详细信息失败:', error)
      return {}
    }
  }
}
