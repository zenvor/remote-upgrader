// 路径验证工具 - 防止路径注入攻击
import path from 'path';
import fs from 'fs-extra';

/**
 * 路径安全验证器
 */
export class PathValidator {
  constructor(allowedBasePaths = []) {
    // 允许的基础路径列表
    this.allowedBasePaths = allowedBasePaths.map(p => path.resolve(p));
    // 危险路径模式
    this.dangerousPatterns = [
      /\.\./,          // 相对路径遍历
      /^\/etc/,        // 系统目录
      /^\/var\/log/,   // 日志目录
      /^\/usr/,        // 系统程序目录
      /^\/bin/,        // 可执行文件目录
      /^\/sbin/,       // 系统可执行文件目录
      /^\/root/,       // root用户目录
      /^\/home/,       // 其他用户目录（限制）
      /^C:\\Windows/i, // Windows系统目录
      /^C:\\Program/i  // Windows程序目录
    ];
  }

  /**
   * 验证路径是否安全
   * @param {string} inputPath - 待验证的路径
   * @param {string} operation - 操作类型（用于日志）
   * @returns {{ valid: boolean, sanitizedPath?: string, reason?: string }}
   */
  validatePath(inputPath, operation = 'unknown') {
    try {
      // 1. 基础检查
      if (!inputPath || typeof inputPath !== 'string') {
        return {
          valid: false,
          reason: '路径不能为空且必须是字符串'
        };
      }

      // 2. 去除多余空格
      const trimmedPath = inputPath.trim();

      // 3. 检查危险模式
      for (const pattern of this.dangerousPatterns) {
        if (pattern.test(trimmedPath)) {
          console.warn(`⚠️ 路径安全检查失败 (${operation}): 检测到危险模式 ${pattern} in ${trimmedPath}`);
          return {
            valid: false,
            reason: `路径包含危险模式: ${pattern}`
          };
        }
      }

      // 4. 解析绝对路径
      const resolvedPath = path.resolve(trimmedPath);

      // 5. 检查是否在允许的基础路径内
      if (this.allowedBasePaths.length > 0) {
        const isAllowed = this.allowedBasePaths.some(basePath => {
          return resolvedPath.startsWith(basePath);
        });

        if (!isAllowed) {
          console.warn(`⚠️ 路径安全检查失败 (${operation}): 路径不在允许范围内 ${resolvedPath}`);
          return {
            valid: false,
            reason: `路径不在允许的基础路径范围内`
          };
        }
      }

      // 6. 检查路径长度
      if (resolvedPath.length > 260) { // Windows路径长度限制
        return {
          valid: false,
          reason: '路径长度超过限制'
        };
      }

      console.log(`✅ 路径安全检查通过 (${operation}): ${resolvedPath}`);
      return {
        valid: true,
        sanitizedPath: resolvedPath
      };

    } catch (error) {
      console.error(`❌ 路径验证异常 (${operation}):`, error);
      return {
        valid: false,
        reason: `路径验证异常: ${error.message}`
      };
    }
  }

  /**
   * 验证并创建安全的部署路径
   * @param {string} inputPath - 输入路径
   * @param {string} defaultPath - 默认安全路径
   * @returns {{ valid: boolean, path: string, reason?: string }}
   */
  validateDeployPath(inputPath, defaultPath) {
    // 如果没有输入路径，使用默认路径
    if (!inputPath) {
      const defaultValidation = this.validatePath(defaultPath, 'default-deploy');
      if (defaultValidation.valid) {
        return {
          valid: true,
          path: defaultValidation.sanitizedPath
        };
      } else {
        return {
          valid: false,
          path: defaultPath,
          reason: `默认路径验证失败: ${defaultValidation.reason}`
        };
      }
    }

    // 验证输入路径
    const validation = this.validatePath(inputPath, 'deploy');
    if (validation.valid) {
      return {
        valid: true,
        path: validation.sanitizedPath
      };
    } else {
      // 输入路径不安全，回退到默认路径
      console.warn(`⚠️ 部署路径不安全，回退到默认路径: ${defaultPath}`);
      const defaultValidation = this.validatePath(defaultPath, 'fallback-deploy');
      return {
        valid: true,
        path: defaultValidation.valid ? defaultValidation.sanitizedPath : defaultPath,
        reason: `输入路径不安全，已回退: ${validation.reason}`
      };
    }
  }

  /**
   * 检查路径是否存在且可写
   * @param {string} targetPath - 目标路径
   * @returns {Promise<{accessible: boolean, writable: boolean, reason?: string}>}
   */
  async checkPathAccessibility(targetPath) {
    try {
      // 确保路径存在
      await fs.ensureDir(targetPath);

      // 检查读写权限
      await fs.access(targetPath, fs.constants.R_OK | fs.constants.W_OK);

      return {
        accessible: true,
        writable: true
      };
    } catch (error) {
      return {
        accessible: false,
        writable: false,
        reason: error.message
      };
    }
  }
}

/**
 * 创建默认的路径验证器实例
 */
export function createDefaultPathValidator() {
  // 定义允许的基础路径
  const allowedPaths = [
    process.cwd(), // 当前工作目录
    '/tmp',        // 临时目录（Linux/Mac）
    process.env.TMPDIR || '/tmp', // 系统临时目录
    '/var/tmp',     // 持久临时目录
    '/Users/claude/CompanyProjects' // 调试使用
  ];

  // Windows特殊处理
  if (process.platform === 'win32') {
    allowedPaths.push(
      'C:\\temp',
      'C:\\tmp',
      process.env.TEMP || 'C:\\temp',
      process.env.TMP || 'C:\\tmp'
    );
  }

  return new PathValidator(allowedPaths);
}

// 导出单例实例
export const defaultPathValidator = createDefaultPathValidator();