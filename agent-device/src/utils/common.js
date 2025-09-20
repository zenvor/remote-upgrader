// 通用工具函数 - 提取重复代码模式 (Agent端)
import fs from 'fs-extra';
import path from 'path';

/**
 * 统一的错误日志记录器
 */
export class ErrorLogger {
  /**
   * 记录错误并包含上下文信息
   * @param {string} operation - 操作描述
   * @param {Error} error - 错误对象
   * @param {Object} context - 上下文信息 (如 deviceId, filePath 等)
   */
  static logError(operation, error, context = {}) {
    const contextStr = Object.keys(context).length > 0
      ? ` [${Object.entries(context).map(([k, v]) => `${k}=${v}`).join(', ')}]`
      : '';

    console.error(`${operation}失败${contextStr}:`, error.message || error);
  }

  /**
   * 记录警告信息
   * @param {string} operation - 操作描述
   * @param {string} message - 警告消息
   * @param {Object} context - 上下文信息
   */
  static logWarning(operation, message, context = {}) {
    const contextStr = Object.keys(context).length > 0
      ? ` [${Object.entries(context).map(([k, v]) => `${k}=${v}`).join(', ')}]`
      : '';

    console.warn(`⚠️ ${operation}${contextStr}: ${message}`);
  }

  /**
   * 记录成功操作
   * @param {string} operation - 操作描述
   * @param {Object} context - 上下文信息
   */
  static logSuccess(operation, context = {}) {
    const contextStr = Object.keys(context).length > 0
      ? ` [${Object.entries(context).map(([k, v]) => `${k}=${v}`).join(', ')}]`
      : '';

    console.log(`✅ ${operation}成功${contextStr}`);
  }
}

/**
 * 文件操作工具类
 */
export class FileHelper {
  /**
   * 安全的文件存在检查
   * @param {string} filePath - 文件路径
   * @returns {Promise<boolean>}
   */
  static async safePathExists(filePath) {
    try {
      return await fs.pathExists(filePath);
    } catch (error) {
      ErrorLogger.logError('检查文件存在', error, { filePath });
      return false;
    }
  }

  /**
   * 安全的JSON读取
   * @param {string} filePath - JSON文件路径
   * @param {*} defaultValue - 默认值
   * @returns {Promise<*>}
   */
  static async safeReadJson(filePath, defaultValue = {}) {
    try {
      if (await this.safePathExists(filePath)) {
        return await fs.readJson(filePath);
      }
      return defaultValue;
    } catch (error) {
      ErrorLogger.logError('读取JSON文件', error, { filePath });
      return defaultValue;
    }
  }

  /**
   * 安全的JSON写入
   * @param {string} filePath - JSON文件路径
   * @param {*} data - 要写入的数据
   * @param {Object} options - 写入选项
   * @returns {Promise<boolean>} 写入是否成功
   */
  static async safeWriteJson(filePath, data, options = { spaces: 2 }) {
    try {
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeJson(filePath, data, options);
      return true;
    } catch (error) {
      ErrorLogger.logError('写入JSON文件', error, { filePath });
      return false;
    }
  }

  /**
   * 安全的目录创建
   * @param {string} dirPath - 目录路径
   * @returns {Promise<boolean>}
   */
  static async safeEnsureDir(dirPath) {
    try {
      await fs.ensureDir(dirPath);
      return true;
    } catch (error) {
      ErrorLogger.logError('创建目录', error, { dirPath });
      return false;
    }
  }

  /**
   * 安全的文件复制
   * @param {string} src - 源文件路径
   * @param {string} dest - 目标文件路径
   * @param {Object} options - 复制选项
   * @returns {Promise<boolean>}
   */
  static async safeCopy(src, dest, options = { overwrite: true }) {
    try {
      await fs.copy(src, dest, options);
      return true;
    } catch (error) {
      ErrorLogger.logError('复制文件', error, { src, dest });
      return false;
    }
  }
}

/**
 * 部署操作结果构造器
 */
export class DeployResult {
  /**
   * 构造成功结果
   * @param {string} message - 成功消息
   * @param {*} data - 附加数据
   * @returns {Object}
   */
  static success(message = '操作成功', data = null) {
    return {
      success: true,
      message,
      ...(data && { data })
    };
  }

  /**
   * 构造错误结果
   * @param {string|Error} error - 错误信息或错误对象
   * @returns {Object}
   */
  static error(error) {
    const message = error instanceof Error ? error.message : error;
    return {
      success: false,
      error: message
    };
  }
}

/**
 * 系统命令执行工具
 */
export class CommandHelper {
  /**
   * 执行 shell 命令的 Promise 包装
   * @param {string} command - 命令
   * @param {Array} args - 参数
   * @param {Object} options - 选项
   * @returns {Promise<Object>}
   */
  static execCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process');

      const process = spawn(command, args, {
        stdio: 'pipe',
        ...options
      });

      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(DeployResult.success(`${command} 执行完成`, { stdout, stderr }));
        } else {
          reject(new Error(`${command} 执行失败: ${stderr || `退出码 ${code}`}`));
        }
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }
}

/**
 * 日期格式化工具类
 */
export class DateHelper {
  /**
   * 格式化日期为 YYYY-MM-dd 格式
   * @param {Date|string} date - 日期对象或ISO字符串
   * @returns {string} YYYY-MM-dd 格式的日期字符串
   */
  static formatToYYYYMMDD(date) {
    const d = date instanceof Date ? date : new Date(date || Date.now());
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * 获取当前日期的 YYYY-MM-dd 格式字符串
   * @returns {string}
   */
  static getCurrentDate() {
    return this.formatToYYYYMMDD(new Date());
  }
}

/**
 * 版本信息管理工具
 */
export class VersionHelper {
  /**
   * 创建标准的版本信息对象
   * @param {string} project - 项目名称
   * @param {string} version - 版本号
   * @param {string} packagePath - 包路径
   * @param {string} deviceId - 设备ID
   * @returns {Object}
   */
  static createVersionInfo(project, version, packagePath, deviceId) {
    return {
      project,
      version,
      deployTime: DateHelper.getCurrentDate(),
      packagePath: path.basename(packagePath),
      deviceId
    };
  }

  /**
   * 读取版本信息
   * @param {string} targetDir - 目标目录
   * @param {string} project - 项目名称
   * @returns {Promise<Object>}
   */
  static async getVersionInfo(targetDir, project) {
    try {
      const versionFile = path.join(targetDir, 'version.json');

      if (await FileHelper.safePathExists(versionFile)) {
        return await FileHelper.safeReadJson(versionFile);
      }

      return {
        project,
        version: 'unknown',
        deployTime: null
      };
    } catch (error) {
      return {
        project,
        version: 'error',
        error: error.message
      };
    }
  }
}

/**
 * 备份信息管理工具
 */
export class BackupHelper {
  /**
   * 创建备份信息对象
   * @param {string} project - 项目名称
   * @param {string} version - 版本号
   * @param {string} backupPath - 备份路径
   * @param {string} sourceDir - 源目录
   * @returns {Object}
   */
  static createBackupInfo(project, version, backupPath, sourceDir) {
    return {
      project,
      version,
      timestamp: DateHelper.getCurrentDate(),
      path: backupPath,
      sourceDir
    };
  }

  /**
   * 根据时间戳解析备份名称
   * @param {string} backupName - 备份名称 (格式: project-timestamp-version)
   * @returns {Object}
   */
  static parseBackupName(backupName) {
    const parts = backupName.split('-');
    if (parts.length < 3) {
      return { project: '', timestamp: 0, version: '' };
    }

    return {
      project: parts[0],
      timestamp: parseInt(parts[1]) || 0,
      version: parts.slice(2).join('-').replace(/^v/, '')
    };
  }
}