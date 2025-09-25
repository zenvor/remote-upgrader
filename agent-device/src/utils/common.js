// 通用工具函数 - 提取重复代码模式 (Agent端)
import path from 'node:path'
import { spawn } from 'node:child_process'
import fs from 'fs-extra'

/**
 * 统一的错误日志记录器
 */
export const ErrorLogger = {
  /**
   * 记录错误并包含上下文信息
   * @param {string} operation - 操作描述
   * @param {Error} error - 错误对象
   * @param {Object} context - 上下文信息 (如 deviceId, filePath 等)
   */
  logError(operation, error, context = {}) {
    // 参数验证
    if (!operation || typeof operation !== 'string') {
      throw new Error('operation 参数不能为空且必须是字符串')
    }
    if (!error) {
      throw new Error('error 参数不能为空')
    }
    if (context && typeof context !== 'object') {
      throw new Error('context 必须是对象')
    }
    const contextString =
      Object.keys(context).length > 0
        ? ` [${Object.entries(context)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ')}]`
        : ''

    console.error(`${operation}失败${contextString}:`, error.message || error)
  },

  /**
   * 记录警告信息
   * @param {string} operation - 操作描述
   * @param {string} message - 警告消息
   * @param {Object} context - 上下文信息
   */
  logWarning(operation, message, context = {}) {
    // 参数验证
    if (!operation || typeof operation !== 'string') {
      throw new Error('operation 参数不能为空且必须是字符串')
    }
    if (!message || typeof message !== 'string') {
      throw new Error('message 参数不能为空且必须是字符串')
    }
    const contextString =
      Object.keys(context).length > 0
        ? ` [${Object.entries(context)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ')}]`
        : ''

    console.warn(`⚠️ ${operation}${contextString}: ${message}`)
  },

  /**
   * 记录成功操作
   * @param {string} operation - 操作描述
   * @param {Object} context - 上下文信息
   */
  logSuccess(operation, context = {}) {
    // 参数验证
    if (!operation || typeof operation !== 'string') {
      throw new Error('operation 参数不能为空且必须是字符串')
    }
    const contextString =
      Object.keys(context).length > 0
        ? ` [${Object.entries(context)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ')}]`
        : ''

    console.log(`✅ ${operation}成功${contextString}`)
  }
}

/**
 * 文件操作工具类
 */
export const FileHelper = {
  /**
   * 安全的文件存在检查
   * @param {string} filePath - 文件路径
   * @returns {Promise<boolean>}
   */
  async safePathExists(filePath) {
    // 参数验证
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('filePath 参数不能为空且必须是字符串')
    }
    try {
      return await fs.pathExists(filePath)
    } catch (error) {
      ErrorLogger.logError('检查文件存在', error, { filePath })
      return false
    }
  },

  /**
   * 安全的JSON读取
   * @param {string} filePath - JSON文件路径
   * @param {*} defaultValue - 默认值
   * @returns {Promise<*>}
   */
  async safeReadJson(filePath, defaultValue = {}) {
    // 参数验证
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('filePath 参数不能为空且必须是字符串')
    }
    try {
      if (await this.safePathExists(filePath)) {
        return await fs.readJson(filePath)
      }

      return defaultValue
    } catch (error) {
      ErrorLogger.logError('读取JSON文件', error, { filePath })
      return defaultValue
    }
  },

  /**
   * 安全的JSON写入
   * @param {string} filePath - JSON文件路径
   * @param {*} data - 要写入的数据
   * @param {Object} options - 写入选项
   * @returns {Promise<boolean>} 写入是否成功
   */
  async safeWriteJson(filePath, data, options = { spaces: 2 }) {
    // 参数验证
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('filePath 参数不能为空且必须是字符串')
    }
    if (data === undefined || data === null) {
      throw new Error('data 参数不能为空')
    }
    try {
      await fs.ensureDir(path.dirname(filePath))
      await fs.writeJson(filePath, data, options)
      return true
    } catch (error) {
      ErrorLogger.logError('写入JSON文件', error, { filePath })
      return false
    }
  },

  /**
   * 安全的目录创建
   * @param {string} dirPath - 目录路径
   * @returns {Promise<boolean>}
   */
  async safeEnsureDir(dirPath) {
    // 参数验证
    if (!dirPath || typeof dirPath !== 'string') {
      throw new Error('dirPath 参数不能为空且必须是字符串')
    }
    try {
      await fs.ensureDir(dirPath)
      return true
    } catch (error) {
      ErrorLogger.logError('创建目录', error, { dirPath })
      return false
    }
  },

  /**
   * 安全的文件复制
   * @param {string} src - 源文件路径
   * @param {string} dest - 目标文件路径
   * @param {Object} options - 复制选项
   * @returns {Promise<boolean>}
   */
  async safeCopy(src, dest, options = { overwrite: true }) {
    // 参数验证
    if (!src || typeof src !== 'string') {
      throw new Error('src 参数不能为空且必须是字符串')
    }
    if (!dest || typeof dest !== 'string') {
      throw new Error('dest 参数不能为空且必须是字符串')
    }
    try {
      await fs.copy(src, dest, options)
      return true
    } catch (error) {
      ErrorLogger.logError('复制文件', error, { src, dest })
      return false
    }
  }
}

/**
 * 部署操作结果构造器
 */
export const DeployResult = {
  /**
   * 构造成功结果
   * @param {string} message - 成功消息
   * @param {*} data - 附加数据
   * @returns {Object}
   */
  success(message = '操作成功', data = null) {
    return {
      success: true,
      message,
      ...(data && { data })
    }
  },

  /**
   * 构造错误结果
   * @param {string|Error} error - 错误信息或错误对象
   * @returns {Object}
   */
  error(error) {
    const message = error instanceof Error ? error.message : error
    return {
      success: false,
      error: message
    }
  }
}

/**
 * 系统命令执行工具
 */
export const CommandHelper = {
  /**
   * 执行 shell 命令的 Promise 包装
   * @param {string} command - 命令
   * @param {Array} args - 参数
   * @param {Object} options - 选项
   * @returns {Promise<Object>}
   */
  execCommand(command, args, options = {}) {
    // 参数验证
    if (!command || typeof command !== 'string') {
      throw new Error('command 参数不能为空且必须是字符串')
    }
    if (!Array.isArray(args)) {
      throw new Error('args 必须是数组')
    }

    // 常量配置
    const constants = {
      defaultTimeout: 60_000 // 60秒默认超时
    }
    return new Promise((resolve, reject) => {
      const process = spawn(command, args, {
        stdio: 'pipe',
        timeout: constants.defaultTimeout,
        ...options
      })

      // 超时处理
      const timeout = options.timeout || constants.defaultTimeout
      const timeoutId = setTimeout(() => {
        process.kill('SIGTERM')
        reject(new Error(`命令执行超时: ${command}`))
      }, timeout)

      let stdout = ''
      let stderr = ''

      process.stdout?.on('data', (data) => {
        stdout += data.toString()
      })

      process.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      process.on('close', (code) => {
        clearTimeout(timeoutId)
        if (code === 0) {
          resolve(DeployResult.success(`${command} 执行完成`, { stdout, stderr }))
        } else {
          reject(new Error(`${command} 执行失败: ${stderr || `退出码 ${code}`}`))
        }
      })

      process.on('error', (error) => {
        clearTimeout(timeoutId)
        reject(error)
      })
    })
  }
}

/**
 * 日期格式化工具类
 */
export const DateHelper = {
  /**
   * 格式化日期为 YYYY-MM-dd 格式
   * @param {Date|string} date - 日期对象或ISO字符串
   * @returns {string} YYYY-MM-dd 格式的日期字符串
   */
  formatToYYYYMMDD(date) {
    const d = date instanceof Date ? date : new Date(date || Date.now())
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  /**
   * 格式化日期为 YYYYMMDDHHmm 格式
   * @param {Date|string|number} date - 日期对象、ISO字符串或时间戳
   * @returns {string} YYYYMMDDHHmm 格式的日期时间字符串
   */
  formatToYYYYMMDDHHmm(date) {
    const d = date instanceof Date ? date : new Date(date || Date.now())
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hour = String(d.getHours()).padStart(2, '0')
    const minute = String(d.getMinutes()).padStart(2, '0')
    return `${year}${month}${day}${hour}${minute}`
  },

  /**
   * 获取当前日期的 YYYY-MM-dd 格式字符串
   * @returns {string}
   */
  getCurrentDate() {
    return this.formatToYYYYMMDD(new Date())
  }
}

/**
 * 版本信息管理工具
 */
export const VersionHelper = {
  /**
   * 创建标准的版本信息对象
   * @param {string} project - 项目名称
   * @param {string} version - 版本号
   * @param {string} packagePath - 包路径
   * @param {string} deviceId - 设备ID
   * @returns {Object}
   */
  createVersionInfo(project, version, packagePath, deviceId) {
    // 参数验证
    if (!project || typeof project !== 'string') {
      throw new Error('project 参数不能为空且必须是字符串')
    }
    if (!version || typeof version !== 'string') {
      throw new Error('version 参数不能为空且必须是字符串')
    }
    if (!packagePath || typeof packagePath !== 'string') {
      throw new Error('packagePath 参数不能为空且必须是字符串')
    }
    if (!deviceId || typeof deviceId !== 'string') {
      throw new Error('deviceId 参数不能为空且必须是字符串')
    }
    return {
      project,
      version,
      deployTime: DateHelper.getCurrentDate(),
      packagePath: path.basename(packagePath),
      deviceId
    }
  },

  /**
   * 读取版本信息
   * @param {string} targetDir - 目标目录
   * @param {string} project - 项目名称
   * @returns {Promise<Object>}
   */
  async getVersionInfo(targetDir, project) {
    // 参数验证
    if (!targetDir || typeof targetDir !== 'string') {
      throw new Error('targetDir 参数不能为空且必须是字符串')
    }
    if (!project || typeof project !== 'string') {
      throw new Error('project 参数不能为空且必须是字符串')
    }
    try {
      const versionFile = path.join(targetDir, 'version.json')

      if (await FileHelper.safePathExists(versionFile)) {
        return await FileHelper.safeReadJson(versionFile)
      }

      return {
        project,
        version: 'unknown',
        deployTime: null
      }
    } catch (error) {
      return {
        project,
        version: 'error',
        error: error.message
      }
    }
  }
}

/**
 * 备份信息管理工具
 */
export const BackupHelper = {
  /**
   * 创建备份信息对象
   * @param {string} project - 项目名称
   * @param {string} version - 版本号
   * @param {string} backupPath - 备份路径
   * @param {string} sourceDir - 源目录
   * @returns {Object}
   */
  createBackupInfo(project, version, backupPath, sourceDir) {
    // 参数验证
    if (!project || typeof project !== 'string') {
      throw new Error('project 参数不能为空且必须是字符串')
    }
    if (!backupPath || typeof backupPath !== 'string') {
      throw new Error('backupPath 参数不能为空且必须是字符串')
    }
    if (!sourceDir || typeof sourceDir !== 'string') {
      throw new Error('sourceDir 参数不能为空且必须是字符串')
    }
    return {
      project,
      version,
      timestamp: DateHelper.getCurrentDate(),
      path: backupPath,
      sourceDir
    }
  },

  /**
   * 根据时间戳解析备份名称
   * @param {string} backupName - 备份名称 (格式: project-timestamp-version)
   * @returns {Object}
   */
  parseBackupName(backupName) {
    // 参数验证
    if (!backupName || typeof backupName !== 'string') {
      throw new Error('backupName 参数不能为空且必须是字符串')
    }
    const parts = backupName.split('-')
    if (parts.length < 3) {
      return { project: '', timestamp: 0, version: '' }
    }

    return {
      project: parts[0],
      timestamp: Number.parseInt(parts[1]) || 0,
      version: parts.slice(2).join('-').replace(/^v/, '')
    }
  }
}
