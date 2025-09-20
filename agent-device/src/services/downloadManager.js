// 中文注释：ESM 导入
import path from 'node:path'
import crypto from 'node:crypto'
import axios from 'axios'
import fs from 'fs-extra'
import { ErrorLogger } from '../utils/common.js'

export default class DownloadManager {
  constructor(config) {
    // 参数验证
    if (!config) {
      throw new Error('配置参数不能为空')
    }

    this.config = config
    this.serverUrl = config.server.url
    this.tempDir = config.download.tempDir
    this.packageDir = config.download.packageDir
    this.maxRetries = config.download.maxRetries
    this.retryDelay = config.download.retryDelay

    // 常量配置
    this.constants = {
      tempFileMaxAge: 24 * 60 * 60 * 1000, // 24小时
      downloadTimeout: 30_000, // 30秒下载超时
      progressUpdateInterval: 1000 // 进度更新间隔1秒
    }

    // 验证必需的配置
    this.validateConfig()
  }

  validateConfig() {
    const requiredFields = [
      'server.url',
      'download.tempDir',
      'download.packageDir'
    ]

    for (const field of requiredFields) {
      const value = this.getNestedValue(this.config, field)
      if (!value) {
        throw new Error(`配置缺少必需字段: ${field}`)
      }
    }
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj)
  }

  async downloadPackage(project, fileName) {
    // 参数验证
    if (!project || !fileName) {
      throw new Error('project 和 fileName 参数不能为空')
    }

    console.log(`开始下载包: ${project}/${fileName}`)

    try {
      // 1. 获取包信息
      const packageInfo = await this.getPackageInfo(project, fileName)
      if (!packageInfo) {
        throw new Error('包信息不存在')
      }

      const targetPath = path.join(this.packageDir, project, fileName)

      // 2. 检查是否已存在且完整
      const expectedMd5 = packageInfo.fileMD5
      if (await this.isFileComplete(targetPath, expectedMd5)) {
        console.log('文件已存在且完整，跳过下载')
        return {
          success: true,
          filePath: targetPath,
          cached: true
        }
      }

      // 3. 执行断点续传下载
      const downloadResult = await this.downloadWithResume(project, fileName, packageInfo, targetPath)

      return downloadResult
    } catch (error) {
      ErrorLogger.logError('下载失败', error, { project, fileName })
      return {
        success: false,
        error: error.message
      }
    }
  }

  async getPackageInfo(project, fileName) {
    if (!project || !fileName) {
      throw new Error('project 和 fileName 参数不能为空')
    }

    try {
      const url = `${this.serverUrl}/packages/${project}/${fileName}`
      const response = await axios.get(url, {
        timeout: this.constants.downloadTimeout
      })

      if (response.data.success) {
        return response.data.package || response.data.data
      }

      throw new Error(response.data.error || '获取包信息失败')
    } catch (error) {
      ErrorLogger.logError('获取包信息失败', error, { project, fileName })
      return null
    }
  }

  async downloadWithResume(project, fileName, packageInfo, targetPath) {
    console.log('开始断点续传下载...')

    const temporaryPath = path.join(this.tempDir, `${project}-${fileName}`)
    await fs.ensureDir(path.dirname(temporaryPath))
    await fs.ensureDir(path.dirname(targetPath))

    let writeStream = null

    try {
      // 检查是否存在未完成的下载
      const existingSize = await this.getFileSize(temporaryPath)
      let downloadedBytes = 0

      if (existingSize > 0) {
        console.log(`检测到未完成下载，继续从 ${existingSize} 字节开始`)
        downloadedBytes = existingSize
      }

      const downloadUrl = `${this.serverUrl}/packages/${project}/${fileName}/download`

      // 设置下载请求头
      const headers = {}
      if (downloadedBytes > 0) {
        headers.Range = `bytes=${downloadedBytes}-`
      }

      // 执行下载
      const response = await axios({
        method: 'GET',
        url: downloadUrl,
        headers,
        responseType: 'stream',
        timeout: this.constants.downloadTimeout
      })

      const totalBytes = Number.parseInt(response.headers['content-length'] || '0') + downloadedBytes

      return new Promise((resolve, reject) => {
        // 正确创建写入流
        writeStream = downloadedBytes > 0
          ? fs.createWriteStream(temporaryPath, { flags: 'a' })
          : fs.createWriteStream(temporaryPath)

        response.data.pipe(writeStream)

        let receivedBytes = downloadedBytes
        let lastProgressTime = 0

        response.data.on('data', (chunk) => {
          receivedBytes += chunk.length

          // 限制进度更新频率
          const now = Date.now()
          if (now - lastProgressTime > this.constants.progressUpdateInterval) {
            const progress = ((receivedBytes / totalBytes) * 100).toFixed(1)
            process.stdout.write(`\r下载进度: ${progress}% (${receivedBytes}/${totalBytes} bytes)`)
            lastProgressTime = now
          }
        })

        writeStream.on('finish', async () => {
          console.log('\n下载完成，验证文件完整性...')

          try {
            // 验证 MD5
            const fileMd5 = await this.calculateMd5(temporaryPath)
            const expectedMd5 = packageInfo.fileMD5
            if (fileMd5 !== expectedMd5) {
              throw new Error(`文件校验失败，期望: ${expectedMd5}，实际: ${fileMd5}`)
            }

            // 移动到最终位置
            await fs.move(temporaryPath, targetPath, { overwrite: true })

            console.log('文件下载并验证成功')
            resolve({
              success: true,
              filePath: targetPath,
              cached: false
            })
          } catch (error) {
            reject(error)
          }
        })

        writeStream.on('error', (error) => {
          ErrorLogger.logError('写入流错误', error, { temporaryPath })
          reject(error)
        })

        response.data.on('error', (error) => {
          ErrorLogger.logError('下载流错误', error, { downloadUrl })
          reject(error)
        })
      })
    } catch (error) {
      // 确保清理资源
      if (writeStream) {
        writeStream.destroy()
      }
      await fs.remove(temporaryPath).catch(() => {})
      throw error
    }
  }

  async isFileComplete(filePath, expectedMd5) {
    try {
      if (!(await fs.pathExists(filePath))) {
        return false
      }

      const fileMd5 = await this.calculateMd5(filePath)
      return fileMd5 === expectedMd5
    } catch {
      return false
    }
  }

  async getFileSize(filePath) {
    try {
      const stats = await fs.stat(filePath)
      return stats.size
    } catch {
      return 0
    }
  }

  async calculateMd5(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5')
      const stream = fs.createReadStream(filePath)

      stream.on('data', (data) => hash.update(data))
      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', reject)
    })
  }

  async cleanupTempFiles() {
    try {
      // 清理超过配置时间的临时文件
      const files = await fs.readdir(this.tempDir)
      const now = Date.now()

      for (const file of files) {
        const filePath = path.join(this.tempDir, file)

        try {
          const stats = await fs.stat(filePath)

          if (now - stats.mtimeMs > this.constants.tempFileMaxAge) {
            await fs.remove(filePath)
            console.log(`清理临时文件: ${file}`)
          }
        } catch (fileError) {
          // 单个文件处理失败不影响其他文件
          ErrorLogger.logError('处理临时文件失败', fileError, { filePath })
        }
      }
    } catch (error) {
      ErrorLogger.logError('清理临时文件失败', error, { tempDir: this.tempDir })
    }
  }
}
