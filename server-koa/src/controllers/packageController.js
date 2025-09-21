// 中文注释：ESM 导入
import fs from 'fs-extra'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getPackageConfig as getConfig,
  removePackageRecord,
  syncPackagesFromFileSystem
} from '../models/packageConfig.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * 获取包列表
 */
async function getPackages(ctx) {
  const { project } = ctx.query

  if (project && !['frontend', 'backend'].includes(project)) {
    ctx.status = 400
    ctx.body = {
      success: false,
      error: 'project 参数必须是 frontend 或 backend'
    }
    return
  }

  try {
    // 先同步文件系统确保配置文件是最新的
    await syncPackagesFromFileSystem()

    // 获取包配置数据
    const config = await getConfig()

    const packages = []
    const projects = project ? [project] : ['frontend', 'backend']

    for (const proj of projects) {
      const packageDir = path.join(__dirname, '../../uploads/packages', proj)

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

        // 从包配置文件中获取包信息
        const packageInfo = config.packages[proj]?.packages[fileName]

        packages.push({
          project: proj,
          fileName,
          fileSize: stats.size,
          fileMD5: packageInfo?.fileMD5 || null,
          version: packageInfo?.version || null,
          uploadedAt: packageInfo?.uploadedAt || null,
          uploadedBy: packageInfo?.uploadedBy || null,
          packagePath: path.join('packages', proj, fileName)
        })
      }
    }

    // 按文件名降序排序以稳定输出
    packages.sort((a, b) => b.fileName.localeCompare(a.fileName))

    ctx.body = {
      success: true,
      packages,
      total: packages.length
    }
  } catch (error) {
    console.error('获取包列表失败:', error)
    ctx.status = 500
    ctx.body = {
      success: false,
      error: process.env.NODE_ENV === 'production' ? '获取包列表失败' : error.message
    }
  }
}

/**
 * 获取包详情
 */
async function getPackageDetail(ctx) {
  const { project, fileName } = ctx.params

  if (!['frontend', 'backend'].includes(project)) {
    ctx.status = 400
    ctx.body = {
      success: false,
      error: 'project 参数必须是 frontend 或 backend'
    }
    return
  }

  try {
    const packagePath = path.join(__dirname, '../../uploads/packages', project, fileName)

    if (!(await fs.pathExists(packagePath))) {
      ctx.status = 404
      ctx.body = {
        success: false,
        error: '包文件不存在'
      }
      return
    }

    const stats = await fs.stat(packagePath)

    // 获取包配置数据
    const config = await getConfig()
    const packageInfo = config.packages[project]?.packages[fileName]

    ctx.body = {
      success: true,
      package: {
        project,
        fileName,
        fileSize: stats.size,
        fileMD5: packageInfo?.fileMD5 || null,
        version: packageInfo?.version || null,
        uploadedAt: packageInfo?.uploadedAt || null,
        uploadedBy: packageInfo?.uploadedBy || null,
        packagePath: path.join('packages', project, fileName)
      }
    }
  } catch (error) {
    console.error('获取包详情失败:', error)
    ctx.status = 500
    ctx.body = {
      success: false,
      error: process.env.NODE_ENV === 'production' ? '获取包详情失败' : error.message
    }
  }
}

/**
 * 删除包
 */
async function deletePackage(ctx) {
  const { project, fileName } = ctx.params

  if (!['frontend', 'backend'].includes(project)) {
    ctx.status = 400
    ctx.body = {
      success: false,
      error: 'project 参数必须是 frontend 或 backend'
    }
    return
  }

  try {
    const packagePath = path.join(__dirname, '../../uploads/packages', project, fileName)

    if (!(await fs.pathExists(packagePath))) {
      ctx.status = 404
      ctx.body = {
        success: false,
        error: '包文件不存在'
      }
      return
    }

    // 删除包文件
    await fs.remove(packagePath)

    // 从配置文件中删除记录
    await removePackageRecord(project, fileName)

    ctx.body = {
      success: true,
      message: '包删除成功'
    }
  } catch (error) {
    console.error('删除包失败:', error)
    ctx.status = 500
    ctx.body = {
      success: false,
      error: process.env.NODE_ENV === 'production' ? '删除包失败' : error.message
    }
  }
}

/**
 * 下载包
 */
async function downloadPackage(ctx) {
  const { project, fileName } = ctx.params

  if (!['frontend', 'backend'].includes(project)) {
    ctx.status = 400
    ctx.body = {
      success: false,
      error: 'project 参数必须是 frontend 或 backend'
    }
    return
  }

  try {
    const packagePath = path.join(__dirname, '../../uploads/packages', project, fileName)

    if (!(await fs.pathExists(packagePath))) {
      ctx.status = 404
      ctx.body = {
        success: false,
        error: '包文件不存在'
      }
      return
    }

    const stats = await fs.stat(packagePath)

    // 安全的文件名处理（防止文件名注入）
    const safeName = fileName.replace(/[\x00-\x1f"\\]/g, '')

    // 设置响应头
    ctx.set('Content-Type', 'application/zip')
    ctx.set('Content-Disposition', `attachment; filename="${safeName}"`)
    ctx.set('Content-Length', stats.size.toString())

    // 流式返回文件
    ctx.body = fs.createReadStream(packagePath)
  } catch (error) {
    console.error('下载包失败:', error)
    ctx.status = 500
    ctx.body = {
      success: false,
      error: process.env.NODE_ENV === 'production' ? '下载包失败' : error.message
    }
  }
}

/**
 * 获取包管理配置
 */
async function getPackageConfig(ctx) {
  try {
    const config = await getConfig()

    ctx.body = {
      success: true,
      config
    }
  } catch (error) {
    console.error('获取包管理配置失败:', error)
    ctx.status = 500
    ctx.body = {
      success: false,
      error: process.env.NODE_ENV === 'production' ? '获取配置失败' : error.message
    }
  }
}

/**
 * 获取包列表简化版 - 专门用于设备升级选择
 */
async function getPackageList(ctx) {
  const { project } = ctx.query

  if (project && !['frontend', 'backend'].includes(project)) {
    ctx.status = 400
    ctx.body = {
      success: false,
      error: 'project 参数必须是 frontend 或 backend'
    }
    return
  }

  try {
    // 先同步文件系统确保配置文件是最新的
    await syncPackagesFromFileSystem()

    // 获取包配置数据
    const config = await getConfig()

    const packages = []
    const projects = project ? [project] : ['frontend', 'backend']

    for (const proj of projects) {
      const packageDir = path.join(__dirname, '../../uploads/packages', proj)

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

        // 从包配置文件中获取包信息
        const packageInfo = config.packages[proj]?.packages[fileName]

        packages.push({
          id: `${proj}_${fileName}`, // 用于前端选择的唯一标识
          project: proj,
          fileName,
          version: packageInfo?.version || '未知版本',
          fileMD5: packageInfo?.fileMD5 || null,
          fileSize: stats.size,
          uploadedAt: packageInfo?.uploadedAt || null,
          displayName: `${packageInfo?.version || '未知版本'} - ${fileName}` // 用于前端显示的友好名称
        })
      }
    }

    // 按项目和版本排序，最新的在前
    packages.sort((a, b) => {
      // 先按项目排序
      if (a.project !== b.project) {
        return a.project.localeCompare(b.project)
      }
      // 同项目内按上传时间倒序
      const timeA = new Date(a.uploadedAt || 0).getTime()
      const timeB = new Date(b.uploadedAt || 0).getTime()
      return timeB - timeA
    })

    ctx.body = {
      success: true,
      packages,
      total: packages.length
    }
  } catch (error) {
    console.error('获取包列表失败:', error)
    ctx.status = 500
    ctx.body = {
      success: false,
      error: process.env.NODE_ENV === 'production' ? '获取包列表失败' : error.message
    }
  }
}

export { deletePackage, downloadPackage, getPackageConfig, getPackageDetail, getPackages, getPackageList }
