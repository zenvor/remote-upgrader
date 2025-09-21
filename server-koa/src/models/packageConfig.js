// 中文注释：包管理配置文件处理模块
import fs from 'fs-extra'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DateHelper } from '../utils/common.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const CONFIG_PATH = path.join(__dirname, '../../config/packages.json')

/**
 * 获取包管理配置
 */
export async function getPackageConfig() {
  try {
    if (await fs.pathExists(CONFIG_PATH)) {
      return await fs.readJSON(CONFIG_PATH)
    }

    // 如果配置文件不存在，创建默认配置
    const defaultConfig = {
      packages: {
        frontend: {
          uploadDir: 'uploads/packages/frontend',
          maxFileSize: '50MB',
          allowedExtensions: ['.zip', '.tar.gz'],
          packages: {}
        },
        backend: {
          uploadDir: 'uploads/packages/backend',
          maxFileSize: '100MB',
          allowedExtensions: ['.zip', '.tar.gz'],
          packages: {}
        }
      },
      settings: {
        autoCleanup: false,
        maxPackageCount: 10,
        storageQuota: '500MB'
      },
      statistics: {
        totalPackages: 0,
        frontendPackages: 0,
        backendPackages: 0,
        totalSize: '0MB',
        lastUpdated: DateHelper.getCurrentDate()
      },
      lastUpdated: DateHelper.getCurrentDate()
    }

    await fs.writeJSON(CONFIG_PATH, defaultConfig, { spaces: 2 })
    return defaultConfig
  } catch (error) {
    console.error('获取包配置失败:', error)
    throw error
  }
}

/**
 * 更新包管理配置
 */
export async function updatePackageConfig(config) {
  try {
    // 更新统计信息
    updatePackageStatistics(config)
    config.lastUpdated = DateHelper.getCurrentDate()
    await fs.writeJSON(CONFIG_PATH, config, { spaces: 2 })
    return config
  } catch (error) {
    console.error('更新包配置失败:', error)
    throw error
  }
}

/**
 * 更新包统计信息
 */
function updatePackageStatistics(config) {
  let totalPackages = 0
  let frontendPackages = 0
  let backendPackages = 0
  let totalSize = 0

  // 统计前端包
  if (config.packages.frontend && config.packages.frontend.packages) {
    frontendPackages = Object.keys(config.packages.frontend.packages).length
    for (const pkg of Object.values(config.packages.frontend.packages)) {
      totalSize += pkg.fileSize || 0
    }
  }

  // 统计后端包
  if (config.packages.backend && config.packages.backend.packages) {
    backendPackages = Object.keys(config.packages.backend.packages).length
    for (const pkg of Object.values(config.packages.backend.packages)) {
      totalSize += pkg.fileSize || 0
    }
  }

  totalPackages = frontendPackages + backendPackages

  // 格式化文件大小
  const formatSize = (bytes) => {
    if (bytes === 0) return '0MB'
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round((bytes / 1024 ** i) * 100) / 100 + sizes[i]
  }

  // 更新统计信息
  config.statistics ||= {}

  config.statistics.totalPackages = totalPackages
  config.statistics.frontendPackages = frontendPackages
  config.statistics.backendPackages = backendPackages
  config.statistics.totalSize = formatSize(totalSize)
  config.statistics.lastUpdated = DateHelper.getCurrentDate()
}

/**
 * 添加包记录到配置文件
 */
export async function addPackageRecord(packageInfo) {
  try {
    // 验证输入参数
    if (!packageInfo || typeof packageInfo !== 'object') {
      throw new Error('无效的包信息')
    }

    const { project, fileName, fileSize } = packageInfo

    // 验证必要字段
    if (!project || !['frontend', 'backend'].includes(project)) {
      throw new Error('项目类型必须是frontend或backend')
    }

    if (!fileName || typeof fileName !== 'string' || fileName.length === 0) {
      throw new Error('文件名不能为空')
    }

    if (!fileSize || typeof fileSize !== 'number' || fileSize <= 0) {
      throw new Error('文件大小必须是正数')
    }

    const config = await getPackageConfig()

    if (!config.packages[project]) {
      throw new Error(`不支持的项目类型: ${project}`)
    }

    config.packages[project].packages[packageInfo.fileName] = {
      fileName: packageInfo.fileName,
      fileSize: packageInfo.fileSize,
      fileMD5: packageInfo.fileMD5,
      version: packageInfo.version,
      uploadedAt: packageInfo.uploadedAt || DateHelper.getCurrentDate(),
      uploadedBy: packageInfo.uploadedBy || 'system'
    }

    return await updatePackageConfig(config)
  } catch (error) {
    console.error('添加包记录失败:', error)
    throw error
  }
}

/**
 * 删除包记录
 */
export async function removePackageRecord(project, fileName) {
  try {
    // 验证输入参数
    if (!project || !['frontend', 'backend'].includes(project)) {
      throw new Error('项目类型必须是frontend或backend')
    }

    if (!fileName || typeof fileName !== 'string' || fileName.trim().length === 0) {
      throw new Error('文件名不能为空')
    }

    const config = await getPackageConfig()

    if (config.packages[project] && config.packages[project].packages[fileName]) {
      delete config.packages[project].packages[fileName]
      return await updatePackageConfig(config)
    }

    return config
  } catch (error) {
    console.error('删除包记录失败:', error)
    throw error
  }
}

/**
 * 获取项目的包列表
 */
export async function getProjectPackages(project) {
  try {
    // 验证项目类型
    if (!project || !['frontend', 'backend'].includes(project)) {
      throw new Error('项目类型必须是frontend或backend')
    }

    const config = await getPackageConfig()

    if (!config.packages[project]) {
      return []
    }

    return Object.values(config.packages[project].packages)
  } catch (error) {
    console.error('获取项目包列表失败:', error)
    throw error
  }
}

/**
 * 同步文件系统与配置文件
 */
export async function syncPackagesFromFileSystem() {
  try {
    const config = await getPackageConfig()
    const updated = { ...config }

    for (const project of ['frontend', 'backend']) {
      const packageDir = path.join(__dirname, '../../uploads/packages', project)

      // eslint-disable-next-line no-await-in-loop -- 顺序处理目录检查避免并发冲突
      if (!(await fs.pathExists(packageDir))) {
        continue
      }

      // eslint-disable-next-line no-await-in-loop -- 顺序处理目录读取避免并发冲突
      const files = await fs.readdir(packageDir)

      for (const fileName of files) {
        const filePath = path.join(packageDir, fileName)
        // eslint-disable-next-line no-await-in-loop -- 顺序处理文件信息避免并发冲突
        const stats = await fs.stat(filePath)

        if (!stats.isFile()) continue

        // 如果配置中不存在此包，添加它（但不包含 MD5，需要手动计算）
        if (!updated.packages[project].packages[fileName]) {
          // 验证文件名安全性
          if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
            console.warn(`跳过不安全的文件名: ${fileName}`)
            continue
          }

          updated.packages[project].packages[fileName] = {
            fileName,
            fileSize: stats.size,
            fileMD5: null, // 需要手动计算或重新上传
            version: null,
            uploadedAt: DateHelper.formatToYYYYMMDD(stats.birthtime),
            uploadedBy: 'system'
          }
        }
      }
    }

    return await updatePackageConfig(updated)
  } catch (error) {
    console.error('同步包文件系统失败:', error)
    throw error
  }
}
