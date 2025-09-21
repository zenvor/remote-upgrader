// 中文注释：ESM 导入
import fs from 'fs-extra'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { addPackageRecord } from '../models/packageConfig.js'
import { calculateFileHash } from '../utils/crypto.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 安全常量
const SECURITY_CONSTANTS = {
  allowedExtensions: ['.zip', '.tar', '.gz', '.tgz'],
  maxFileNameLength: 100,
  forbiddenChars: /[<>:"/|?*\u0000-\u001f]/g,
  pathTraversalPattern: /\.\.|\//g
}

/**
 * 从文件名中提取版本号
 */
function extractVersionFromFileName(fileName) {
  // 尝试匹配 v1.0.0 或 1.0.0 格式的版本号
  const versionMatch = fileName.match(/v?(\d+\.\d+\.\d+)/)
  return versionMatch ? versionMatch[1] : null
}

// 中文注释：校验版本号（支持 v 前缀、预发布与构建元数据）
function isValidVersion(version) {
  const semverReg =
    /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[\dA-Za-z-]+(?:\.[\dA-Za-z-]+)*)?(?:\+[\dA-Za-z-]+(?:\.[\dA-Za-z-]+)*)?$/
  return semverReg.test(version.trim())
}

// 中文注释：规范化版本号（无 v 前缀则补上）
function normalizeVersion(version) {
  const v = version.trim()
  return v.startsWith('v') ? v : `v${v}`
}

/**
 * 直接上传文件接口（简化版）
 */
async function directUpload(ctx) {
  // Multer 中间件将文本字段放在 ctx.request.body，文件放在 ctx.file
  // 仅在开发环境显示调试信息
  if (process.env.NODE_ENV !== 'production') {
    console.log('调试信息 - ctx.request.body:', ctx.request.body)
    console.log('调试信息 - ctx.file:', ctx.file)
    console.log('调试信息 - project 类型:', typeof ctx.request.body.project)
  }

  const { project } = ctx.request.body
  // 中文注释：前端可选传入的版本号
  const inputVersion = (ctx.request.body.version || '').trim()
  const { file } = ctx

  // 参数验证
  if (!project || !file) {
    ctx.status = 400
    ctx.body = {
      success: false,
      error: '缺少必要参数: project, file'
    }
    return
  }

  if (!['frontend', 'backend'].includes(project)) {
    ctx.status = 400
    ctx.body = {
      success: false,
      error: 'project 参数必须是 frontend 或 backend'
    }
    return
  }

  try {
    // 检查目标目录
    const packageDir = path.join(__dirname, '../../uploads/packages', project)
    await fs.ensureDir(packageDir)

    // 安全验证文件名
    const safeFileName = sanitizeFileName(file.originalname)
    if (!safeFileName) {
      ctx.status = 400
      ctx.body = {
        success: false,
        error: '文件名无效或包含非法字符'
      }
      return
    }

    // 检查文件扩展名
    const fileExt = path.extname(safeFileName).toLowerCase()
    if (!SECURITY_CONSTANTS.allowedExtensions.includes(fileExt)) {
      ctx.status = 400
      ctx.body = {
        success: false,
        error: `不支持的文件类型，只支持: ${SECURITY_CONSTANTS.allowedExtensions.join(', ')}`
      }
      return
    }

    const targetPath = path.join(packageDir, safeFileName)

    // 将文件从内存缓冲区写入磁盘
    await fs.writeFile(targetPath, file.buffer)

    // 计算文件MD5
    const fileMD5 = await calculateFileHash(targetPath)

    // 检查是否已存在相同MD5文件（秒传检查）
    const existingFiles = await fs.readdir(packageDir)
    for (const existingFile of existingFiles) {
      if (existingFile !== file.originalname) {
        const existingPath = path.join(packageDir, existingFile)
        // eslint-disable-next-line no-await-in-loop -- 顺序处理文件比较避免并发冲突
        const existingStat = await fs.stat(existingPath)
        if (existingStat.size === file.size) {
          // eslint-disable-next-line no-await-in-loop -- 顺序处理文件比较避免并发冲突
          const existingMD5 = await calculateFileHash(existingPath)
          if (existingMD5 === fileMD5) {
            // 发现重复文件，删除刚上传的文件
            // eslint-disable-next-line no-await-in-loop -- 顺序处理文件删除避免并发冲突
            await fs.unlink(targetPath)
            ctx.body = {
              success: true,
              done: true,
              message: `文件已存在（${existingFile}），秒传成功`,
              fileMD5,
              fileName: safeFileName,
              fileSize: file.size,
              packagePath: path.relative(path.join(__dirname, '../..'), existingPath)
            }
            return
          }
        }
      }
    }

    // 提取或使用用户输入的版本信息
    let version
    if (inputVersion) {
      if (!isValidVersion(inputVersion)) {
        ctx.status = 400
        ctx.body = {
          success: false,
          error: '版本号不合法，示例：v1.2.3 或 1.2.3[-beta][+build]'
        }
        return
      }

      version = normalizeVersion(inputVersion)
    } else {
      const extracted = extractVersionFromFileName(file.originalname)
      version = extracted ? normalizeVersion(extracted) : 'unknown'
    }

    // 添加包记录到配置中
    await addPackageRecord({
      project,
      version: version || 'unknown',
      fileName: safeFileName,
      filePath: path.relative(path.join(__dirname, '../..'), targetPath),
      fileSize: file.size,
      fileMD5,
      uploadedAt: new Date().toISOString()
    })

    ctx.body = {
      success: true,
      done: true,
      message: '文件上传完成',
      version,
      fileMD5,
      fileName: safeFileName,
      fileSize: file.size,
      packagePath: path.relative(path.join(__dirname, '../..'), targetPath)
    }
  } catch (error) {
    console.error('直接上传失败:', error)
    ctx.status = 500
    ctx.body = {
      success: false,
      error: `上传失败: ${error.message}`
    }
  }
}

/**
 * 清理文件名，防止路径遭历攻击
 */
function sanitizeFileName(fileName) {
  if (!fileName || typeof fileName !== 'string') {
    return null
  }

  // 检查文件名长度
  if (fileName.length > SECURITY_CONSTANTS.maxFileNameLength) {
    return null
  }

  // 移除路径遭历字符
  if (SECURITY_CONSTANTS.pathTraversalPattern.test(fileName)) {
    return null
  }

  // 移除禁止的字符
  const cleaned = fileName.replace(SECURITY_CONSTANTS.forbiddenChars, '')

  // 检查清理后的文件名是否仍然有效
  if (!cleaned || cleaned.length === 0 || cleaned.startsWith('.')) {
    return null
  }

  return cleaned
}

export { directUpload }
