// 通用工具函数 - 提取重复代码模式
import fs from 'fs-extra';

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
      await fs.ensureDir(require('path').dirname(filePath));
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
}

/**
 * 异步操作重试工具
 */
export class RetryHelper {
  /**
   * 带重试的异步操作执行
   * @param {Function} operation - 要执行的异步操作
   * @param {Object} options - 重试选项
   * @param {number} options.maxRetries - 最大重试次数
   * @param {number} options.delay - 重试间隔 (毫秒)
   * @param {string} options.operationName - 操作名称 (用于日志)
   * @param {Object} options.context - 上下文信息
   * @returns {Promise<*>}
   */
  static async withRetry(operation, options = {}) {
    const {
      maxRetries = 3,
      delay = parseInt(process.env.DEFAULT_RETRY_DELAY) || 1000,
      operationName = '未知操作',
      context = {}
    } = options;

    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (attempt === maxRetries) {
          ErrorLogger.logError(`${operationName}(重试${maxRetries}次后最终失败)`, error, context);
          throw error;
        }

        ErrorLogger.logWarning(`${operationName}(第${attempt}次尝试失败)`, error.message, context);

        // 等待后重试
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
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
 * 统一的响应构造器
 */
export class ResponseHelper {
  /**
   * 构造成功响应
   * @param {*} data - 响应数据
   * @param {string} message - 成功消息
   * @returns {Object}
   */
  static success(data = null, message = '操作成功') {
    return {
      success: true,
      message,
      data
    };
  }

  /**
   * 构造错误响应
   * @param {string|Error} error - 错误信息或错误对象
   * @param {number} code - 错误代码
   * @returns {Object}
   */
  static error(error, code = 500) {
    const message = error instanceof Error ? error.message : error;
    return {
      success: false,
      error: message,
      code
    };
  }
}