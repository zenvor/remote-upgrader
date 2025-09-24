// 中文注释：ESM 导入
import fs from 'fs-extra'
import { spawn } from 'node:child_process'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { BackupHelper, DeployResult, ErrorLogger, FileHelper, VersionHelper } from '../utils/common.js'
import { defaultPathValidator } from '../utils/pathValidator.js'

export default class DeployManager {
  constructor(config, agent = null) {
    // 参数验证
    if (!config) {
      throw new Error('配置参数不能为空')
    }

    this.config = config
    this.agent = agent // 添加 agent 引用用于通信

    // 常量配置
    this.constants = {
      maxDisplayFiles: 15, // 目录状态检查显示的最大文件数
      configDir: config.deploy?.configDir || './config', // 配置文件目录
      deployPathsConfigFile: 'deploy-paths.json', // 部署路径配置文件名
      processTimeout: 60_000, // 子进程超时（60秒）
      maxBackupNameLength: 50, // 备份名称最大长度
      backupRetentionDays: 30 // 备份保留天数
    }

    this.frontendDir = config.deploy.frontendDir
    this.backendDir = config.deploy.backendDir
    this.backupDir = config.deploy.backupDir
    this.maxBackups = config.deploy.maxBackups

    // 验证必需的配置
    this.validateConfig()
  }

  validateConfig() {
    const requiredFields = ['deploy.frontendDir', 'deploy.backendDir', 'deploy.backupDir']

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

  async initialize() {
    try {
      // 确保必要目录存在
      await fs.ensureDir(this.frontendDir)
      await fs.ensureDir(this.backendDir)
      await fs.ensureDir(this.backupDir)

      // 初始化部署路径配置文件
      await this.initializeDeployPathsConfig()

      console.log('✅ 部署管理器初始化完成')
      console.log(`📂 前端目录: ${this.frontendDir}`)
      console.log(`📂 后端目录: ${this.backendDir}`)
      console.log(`📂 备份目录: ${this.backupDir}`)
      console.log(`🗂 备份策略: ${this.maxBackups > 0 ? `保留最新 ${this.maxBackups} 个` : '保留所有备份'}`)
    } catch (error) {
      ErrorLogger.logError('部署管理器初始化', error)
      throw error
    }
  }

  async deploy(project, packagePath, version, deployPathOverride = null) {
    // 参数验证
    if (!project || !packagePath) {
      throw new Error('project 和 packagePath 参数不能为空')
    }
    if (!['frontend', 'backend'].includes(project)) {
      throw new Error('project 必须是 frontend 或 backend')
    }
    console.log(`开始部署 ${project} 包: ${packagePath}`)

    try {
      const defaultTarget = project === 'frontend' ? this.frontendDir : this.backendDir

      // 安全验证部署路径
      const pathValidation = defaultPathValidator.validateDeployPath(deployPathOverride, defaultTarget)
      const targetDir = pathValidation.path

      if (!pathValidation.valid) {
        console.warn(`⚠️ 部署路径安全检查: ${pathValidation.reason}`)
      }

      // 检查路径访问权限
      const accessibility = await defaultPathValidator.checkPathAccessibility(targetDir)
      if (!accessibility.accessible) {
        throw new Error(`部署目录不可访问: ${accessibility.reason}`)
      }

      console.log(`✅ 使用安全验证后的部署路径: ${targetDir}`)

      // 1. 先备份当前运行的旧版本（如果存在）
      console.log(`🔄 检查并备份当前版本...`)
      const backupResult = await this.backupCurrentVersion(project, targetDir)

      // 2. 解压和部署新版本
      console.log(`🔄 开始部署新版本 ${version}...`)
      const deployResult = await this.extractAndDeploy(packagePath, targetDir, project)

      if (!deployResult.success) {
        // 部署失败，尝试恢复备份
        console.log('❌ 部署失败，恢复旧版本...')
        await this.restoreBackup(project)
        throw new Error(deployResult.error)
      }

      // 3. 更新版本信息
      await this.updateVersionInfo(project, version, packagePath, targetDir)

      // 4. 更新部署路径配置
      await this.updateDeployPathConfig(project, targetDir, version)

      // 5. 可选清理旧备份（默认保留所有备份）
      if (this.maxBackups && this.maxBackups > 0) {
        await this.cleanupOldBackups(project)
      }

      ErrorLogger.logSuccess('部署', { project, version })
      return DeployResult.success('部署成功', {
        deployPath: targetDir,
        backupCreated: backupResult.success,
        backupPath: backupResult.backupPath
      })
    } catch (error) {
      ErrorLogger.logError('部署', error, { project, version, packagePath })
      return DeployResult.error(error)
    }
  }

  /**
   * 备份当前运行的版本（在部署新版本之前）
   */
  async backupCurrentVersion(project, targetDir) {
    try {
      // 检查目标目录是否有内容
      const hasExisting = await this.hasContent(targetDir)
      if (!hasExisting) {
        console.log(`ℹ️ 部署目录为空，跳过备份: ${targetDir}`)
        return { success: false, reason: 'target_empty' }
      }

      // 获取当前版本信息（如果有）
      let currentVersion = 'unknown'
      try {
        const versionFile = path.join(targetDir, 'version.json')
        if (await fs.pathExists(versionFile)) {
          const versionInfo = await fs.readJson(versionFile)
          currentVersion = versionInfo.version || 'unknown'
        }
      } catch {
        // 版本信息读取失败不影响备份
      }

      // 生成带时间戳的备份目录名
      const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-')
      const backupName = `${project}-backup-${timestamp}-from-${currentVersion}`
      const backupPath = path.join(this.backupDir, backupName)

      // 删除旧的最新备份链接（如果存在）
      const latestBackupLink = path.join(this.backupDir, `${project}-latest`)
      if (await fs.pathExists(latestBackupLink)) {
        await fs.remove(latestBackupLink)
        console.log(`♻️ 已移除旧备份: ${project}-latest`)
      }

      // 创建新备份
      await fs.copy(targetDir, backupPath)
      console.log(`📦 已备份旧版本: ${backupName}`)

      // 创建新的最新备份链接
      await fs.copy(backupPath, latestBackupLink)
      console.log(`🔗 已更新最新备份链接: ${project}-latest`)

      // 记录备份信息
      const backupInfo = {
        project,
        originalVersion: currentVersion,
        backupTime: new Date().toISOString(),
        sourceDir: targetDir,
        backupPath,
        deviceId: this.config.device.id,
        type: 'pre-deployment-backup'
      }
      await FileHelper.safeWriteJson(path.join(backupPath, 'backup-info.json'), backupInfo)

      return {
        success: true,
        backupPath,
        backupName,
        originalVersion: currentVersion
      }
    } catch (error) {
      ErrorLogger.logWarning('备份当前版本', error.message, {
        project,
        targetDir
      })
      return { success: false, error: error.message }
    }
  }

  /**
   * 检查目录是否有内容
   */
  async hasContent(dirPath) {
    try {
      if (!(await fs.pathExists(dirPath))) return false
      const files = await fs.readdir(dirPath)
      return files.some((f) => !f.startsWith('.'))
    } catch {
      return false
    }
  }

  async createBackup(project, version, sourceDirOverride = null) {
    // 参数验证
    if (!project) {
      throw new Error('project 参数不能为空')
    }
    if (!['frontend', 'backend'].includes(project)) {
      throw new Error('project 必须是 frontend 或 backend')
    }
    const defaultSource = project === 'frontend' ? this.frontendDir : this.backendDir
    const sourceDir = sourceDirOverride || defaultSource

    // 生成带时间戳的备份目录名 - 确保唯一性和可读性
    const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-')
    const versionSuffix = version ? `-v${version}` : ''
    const backupName = `${project}-backup-${timestamp}${versionSuffix}`
    const backupPath = path.join(this.backupDir, backupName)

    try {
      if (await FileHelper.safePathExists(sourceDir)) {
        console.log(`📦 创建历史备份: ${backupName}`)
        await fs.copy(sourceDir, backupPath, {
          overwrite: false,
          errorOnExist: false
        })

        // 记录备份信息
        const backupInfo = BackupHelper.createBackupInfo(project, version, backupPath, sourceDir)
        await FileHelper.safeWriteJson(path.join(backupPath, 'backup-info.json'), backupInfo)

        // 同时更新"最新备份"链接，用于快速回滚
        const latestBackupLink = path.join(this.backupDir, `${project}-latest`)

        // 删除旧的最新备份链接
        if (await fs.pathExists(latestBackupLink)) {
          await fs.remove(latestBackupLink)
        }

        // 创建新的最新备份（复制，不是链接，以保证跨平台兼容性）
        await fs.copy(backupPath, latestBackupLink)
        console.log(`🔗 已更新最新备份链接: ${project}-latest`)

        return { success: true, backupPath, backupName }
      }

      console.log(`ℹ️ 源目录为空或不存在，跳过备份: ${sourceDir}`)
      return { success: false, reason: 'source_not_exists' }
    } catch (error) {
      ErrorLogger.logWarning('创建备份', error.message, { project, version })
      return { success: false, error: error.message }
    }
  }

  async extractAndDeploy(packagePath, targetDir, project) {
    // 参数验证
    if (!packagePath || !targetDir || !project) {
      throw new Error('packagePath, targetDir 和 project 参数不能为空')
    }
    try {
      // 确保目标目录存在
      await fs.ensureDir(targetDir)

      // 部署前目录状态检查
      console.log(`🔍 部署前目录状态检查: ${targetDir}`)
      await this.checkDirectoryStatus(targetDir, '部署前')

      // 清空目标目录（删除所有旧文件，确保完全替换）
      console.log(`🗑 开始清空目标目录: ${targetDir}`)
      await this.ensureDirectoryEmpty(targetDir)

      // 清空后检查
      console.log(`🔍 清空后目录状态检查: ${targetDir}`)
      await this.checkDirectoryStatus(targetDir, '清空后')

      // 检查包文件类型
      const ext = path.extname(packagePath).toLowerCase()

      let extractResult
      if (ext === '.zip') {
        extractResult = await this.extractZip(packagePath, targetDir)
      } else if (ext === '.tar' || ext === '.tgz' || ext === '.gz') {
        throw new Error(`不支持的压缩格式: ${ext}。仅支持 ZIP 格式，请重新打包为 ZIP 文件。`)
      } else {
        // 直接复制文件
        const fileName = path.basename(packagePath)
        const fileTargetPath = path.join(targetDir, fileName)
        await FileHelper.safeCopy(packagePath, fileTargetPath)
        extractResult = DeployResult.success('文件复制完成')
      }

      // 解压完成后验证
      console.log(`🔍 解压完成后验证...`)
      try {
        const extractedFiles = await fs.readdir(targetDir)
        console.log(`📁 解压后文件数量: ${extractedFiles.length}`)

        if (extractedFiles.length > 0) {
          // 部署完成后检查
          console.log(`🔍 部署完成后目录状态检查: ${targetDir}`)
          await this.checkDirectoryStatus(targetDir, '部署完成后')
        } else {
          console.warn(`⚠️ 警告：解压后目录为空！`)
        }
      } catch (verifyError) {
        ErrorLogger.logError('解压后验证失败', verifyError, { targetDir })
      }

      return extractResult
    } catch (error) {
      return DeployResult.error(error)
    }
  }

  async extractZip(zipPath, targetDir) {
    try {
      console.log(`🔧 准备解压ZIP文件:`)
      console.log(`  源文件: ${zipPath}`)
      console.log(`  目标目录: ${targetDir}`)
      console.log(`  使用: adm-zip (跨平台)`)

      // 验证 ZIP 文件是否存在
      if (!(await fs.pathExists(zipPath))) {
        throw new Error(`ZIP 文件不存在: ${zipPath}`)
      }

      // 确保目标目录存在
      await fs.ensureDir(targetDir)

      // 创建 AdmZip 实例
      const zip = new AdmZip(zipPath)
      const zipEntries = zip.getEntries()

      console.log(`📦 ZIP 文件包含 ${zipEntries.length} 个条目`)

      // 验证 ZIP 文件完整性
      let hasValidEntries = false
      for (const entry of zipEntries) {
        if (!entry.isDirectory && entry.getData().length > 0) {
          hasValidEntries = true
          break
        }
      }

      if (!hasValidEntries) {
        throw new Error('ZIP 文件为空或损坏')
      }

      // 解压文件
      console.log(`📂 开始解压到目标目录...`)
      zip.extractAllTo(targetDir, true)

      // 验证解压结果
      const extractedFiles = await fs.readdir(targetDir)
      const fileCount = extractedFiles.length

      if (fileCount === 0) {
        throw new Error('解压完成但目标目录为空')
      }

      console.log(`✅ ZIP 解压成功，解压了 ${fileCount} 个文件/目录`)

      // 显示解压的主要文件
      const displayFiles = extractedFiles.slice(0, 5)
      console.log(`📋 主要文件: ${displayFiles.join(', ')}${fileCount > 5 ? ' ...' : ''}`)

      return DeployResult.success('ZIP 解压完成')
    } catch (error) {
      console.error(`❌ ZIP 解压失败: ${error.message}`)
      ErrorLogger.logError('ZIP 解压', error, { zipPath, targetDir })
      return DeployResult.error(error)
    }
  }


  async updateVersionInfo(project, version, packagePath, targetDirOverride = null) {
    // 参数验证
    if (!project || !version || !packagePath) {
      throw new Error('project, version 和 packagePath 参数不能为空')
    }
    const defaultTarget = project === 'frontend' ? this.frontendDir : this.backendDir
    const targetDir = targetDirOverride || defaultTarget
    const versionFile = path.join(targetDir, 'version.json')

    const versionInfo = VersionHelper.createVersionInfo(project, version, packagePath, this.config.device.id)
    await FileHelper.safeWriteJson(versionFile, versionInfo)
    console.log(`版本信息已更新: ${version}`)
  }

  /**
   * 详细检查目录状态
   * 显示文件数量、文件列表、大小、权限等信息
   */
  async checkDirectoryStatus(targetDir, stage = '') {
    // 确保使用绝对路径
    const absoluteTargetDir = path.isAbsolute(targetDir) ? targetDir : path.resolve(targetDir)

    try {
      if (!(await fs.pathExists(absoluteTargetDir))) {
        console.log(`📂 ${stage} 目录不存在: ${absoluteTargetDir}`)
        return
      }

      const files = await fs.readdir(absoluteTargetDir)

      console.log(`📊 ${stage} 目录统计:`)
      console.log(`  📁 目录路径: ${absoluteTargetDir}`)
      console.log(`  📄 文件总数: ${files.length}`)

      if (files.length === 0) {
        console.log(`  ✅ 目录为空`)
        return
      }

      // 并行统计文件和目录信息，提高性能
      const fileStats = await Promise.allSettled(
        files.map(async (file) => {
          const filePath = path.join(absoluteTargetDir, file)
          try {
            const stat = await fs.stat(filePath)
            const isDir = stat.isDirectory()

            // 获取权限信息（仅Linux/macOS）
            let permissions = ''
            if (process.platform !== 'win32') {
              const { mode } = stat
              permissions = '0' + (mode & 0o777).toString(8)
            }

            return {
              name: file,
              type: isDir ? '目录' : '文件',
              size: isDir ? '-' : this.formatFileSize(stat.size),
              permissions: permissions || 'N/A',
              modified: stat.mtime.toLocaleString('zh-CN'),
              isDir,
              fileSize: stat.size
            }
          } catch (statError) {
            console.warn(`⚠️ 无法获取文件信息: ${file} - ${statError.message}`)
            return null
          }
        })
      )

      // 处理统计结果
      let fileCount = 0
      let dirCount = 0
      let totalSize = 0
      const fileDetails = []

      for (const result of fileStats) {
        if (result.status === 'fulfilled' && result.value) {
          const fileInfo = result.value
          fileDetails.push({
            name: fileInfo.name,
            type: fileInfo.type,
            size: fileInfo.size,
            permissions: fileInfo.permissions,
            modified: fileInfo.modified
          })

          if (fileInfo.isDir) {
            dirCount++
          } else {
            fileCount++
            totalSize += fileInfo.fileSize
          }
        }
      }

      console.log(`  📄 文件数量: ${fileCount}`)
      console.log(`  🗂️  目录数量: ${dirCount}`)
      console.log(`  💾 总大小: ${this.formatFileSize(totalSize)}`)

      // 显示详细文件列表（限制显示数量以免刷屏）
      const maxDisplay = this.constants.maxDisplayFiles
      console.log(`\n📋 ${stage} 文件详情 (显示前 ${Math.min(files.length, maxDisplay)} 项):`)

      for (const [index, item] of fileDetails.slice(0, maxDisplay).entries()) {
        const icon = item.type === '目录' ? '🗂️ ' : '📄'
        console.log(
          `  ${(index + 1).toString().padStart(2)}. ${icon} ${item.name.padEnd(30)} ${item.type.padEnd(4)} ${item.size.padStart(10)} ${item.permissions} ${item.modified}`
        )
      }

      if (files.length > maxDisplay) {
        console.log(`  ... 还有 ${files.length - maxDisplay} 个文件未显示`)
      }

      console.log('') // 空行分隔
    } catch (error) {
      ErrorLogger.logError(`${stage}目录状态检查失败`, error, { targetDir: absoluteTargetDir })
    }
  }

  /**
   * 格式化文件大小显示
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B'

    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return Number.parseFloat((bytes / k ** i).toFixed(1)) + ' ' + sizes[i]
  }

  /**
   * 确保目录完全清空的强化方法
   * 使用多种策略逐步升级清空力度
   */
  async ensureDirectoryEmpty(targetDir) {
    try {
      // 方法1：尝试使用 fs.emptyDir
      console.log(`🔧 方法1：使用 fs.emptyDir 清空目录...`)
      await fs.emptyDir(targetDir)
      console.log(`✅ fs.emptyDir 执行完成`)

      // 严格验证清空结果
      const afterFiles = await fs.readdir(targetDir)
      console.log(`📁 清空后文件数量: ${afterFiles.length}`)

      // 如果还有文件，说明 fs.emptyDir 没有生效
      if (afterFiles.length > 0) {
        console.warn(`⚠️ fs.emptyDir 未完全清空，剩余文件: ${afterFiles.join(', ')}`)
        await this.forceEmptyDirectory(targetDir, afterFiles)
      } else {
        console.log(`✅ 目标目录清空成功`)
      }
    } catch (emptyError) {
      ErrorLogger.logError('fs.emptyDir 失败', emptyError, { targetDir })

      // Fs.emptyDir 完全失败时，尝试读取目录并强制清空
      try {
        const files = await fs.readdir(targetDir)
        if (files.length > 0) {
          console.log(`🔧 fs.emptyDir 失败，尝试强制清空 ${files.length} 个文件...`)
          await this.forceEmptyDirectory(targetDir, files)
        }
      } catch (readError) {
        ErrorLogger.logError('无法读取目录内容', readError, { targetDir })
        throw new Error(`无法清空目标目录: ${emptyError.message}`)
      }
    }
  }

  /**
   * 强制清空目录的多重策略
   */
  async forceEmptyDirectory(targetDir, fileList) {
    console.log(`🔧 方法2：手动删除所有文件...`)

    // 策略1：使用 fs.remove 逐个删除（顺序处理避免文件系统冲突）
    let remainingFiles = [...fileList]
    for (const file of fileList) {
      const filePath = path.join(targetDir, file)
      try {
        // eslint-disable-next-line no-await-in-loop -- 顺序删除避免文件系统冲突
        const stat = await fs.stat(filePath)
        // eslint-disable-next-line no-await-in-loop -- 顺序删除避免文件系统冲突
        await fs.remove(filePath)
        remainingFiles = remainingFiles.filter((f) => f !== file)
        console.log(`${stat.isDirectory() ? '🗂️' : '📄'} 删除${stat.isDirectory() ? '目录' : '文件'}: ${file}`)
      } catch (removeError) {
        ErrorLogger.logError(`fs.remove 删除失败 ${file}`, removeError, { filePath })
      }
    }

    // 验证手动删除结果
    const afterManualFiles = await fs.readdir(targetDir)
    console.log(`📁 手动清理后文件数量: ${afterManualFiles.length}`)

    if (afterManualFiles.length > 0) {
      console.warn(`⚠️ 手动删除后仍有剩余文件: ${afterManualFiles.join(', ')}`)

      // 策略2：使用系统命令强制删除（Linux/macOS）
      if (process.platform === 'win32') {
        // Windows 策略：使用 PowerShell 强制删除
        await this.windowsForceDelete(targetDir, afterManualFiles)
      } else {
        await this.systemForceDelete(targetDir, afterManualFiles)
      }
    } else {
      console.log(`✅ 目录已完全清空`)
    }
  }

  /**
   * Linux/macOS 系统级强制删除
   */
  async systemForceDelete(targetDir, fileList) {
    console.log(`🔧 方法3：使用系统命令强制删除...`)

    return new Promise((resolve, reject) => {
      // 使用 rm -rf 强制删除所有内容
      const rm = spawn('rm', ['-rf', ...fileList.map((f) => path.join(targetDir, f))], {
        cwd: targetDir,
        stdio: 'pipe',
        timeout: this.constants.processTimeout
      })

      let stderr = ''
      rm.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      rm.on('close', async (code) => {
        if (code === 0) {
          // 验证删除结果
          const finalFiles = await fs.readdir(targetDir)
          if (finalFiles.length === 0) {
            console.log(`✅ 系统命令删除成功`)
            resolve()
          } else {
            const error = new Error(`无法完全清空目录，剩余 ${finalFiles.length} 个文件`)
            ErrorLogger.logError('系统命令删除后仍有剩余文件', error, { finalFiles, targetDir })
            reject(error)
          }
        } else {
          const error = new Error(`系统命令删除失败: ${stderr}`)
          ErrorLogger.logError('系统命令删除失败', error, { code, targetDir })
          reject(error)
        }
      })

      rm.on('error', (error) => {
        ErrorLogger.logError('系统命令执行错误', error, { targetDir })
        reject(error)
      })
    })
  }

  /**
   * Windows PowerShell 强制删除
   */
  async windowsForceDelete(targetDir, fileList) {
    console.log(`🔧 方法3：使用 PowerShell 强制删除...`)

    return new Promise((resolve, reject) => {
      // 构建 PowerShell 删除命令
      const deleteCommands = fileList
        .map((file) => {
          const filePath = path.join(targetDir, file).replaceAll('\\', '\\\\')
          return `Remove-Item -Path '${filePath}' -Recurse -Force -ErrorAction SilentlyContinue`
        })
        .join('; ')

      const powershell = spawn('powershell', ['-Command', deleteCommands], {
        stdio: 'pipe',
        timeout: this.constants.processTimeout
      })

      let stderr = ''
      powershell.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      powershell.on('close', async () => {
        // 验证删除结果
        const finalFiles = await fs.readdir(targetDir)
        if (finalFiles.length === 0) {
          console.log(`✅ PowerShell 删除成功`)
          resolve()
        } else {
          const error = new Error(`无法完全清空目录，剩余 ${finalFiles.length} 个文件`)
          ErrorLogger.logError('PowerShell 删除后仍有剩余文件', error, { finalFiles, stderr, targetDir })
          reject(error)
        }
      })

      powershell.on('error', (error) => {
        ErrorLogger.logError('PowerShell 执行错误', error, { targetDir })
        reject(error)
      })
    })
  }

  async rollback(project, targetVersion = null) {
    // 参数验证
    if (!project) {
      throw new Error('project 参数不能为空')
    }
    if (!['frontend', 'backend'].includes(project)) {
      throw new Error('project 必须是 frontend 或 backend')
    }
    console.log(`开始回滚 ${project} 到版本: ${targetVersion || '最新备份'}`)

    try {
      // 优先使用最新备份链接进行快速回滚
      const latestBackupDir = path.join(this.backupDir, `${project}-latest`)

      let backupPath
      if (!targetVersion && (await fs.pathExists(latestBackupDir))) {
        // 使用最新备份
        backupPath = latestBackupDir
        console.log(`📂 使用最新备份: ${project}-latest`)
      } else {
        // 查找指定版本或历史备份
        const availableBackups = await this.getAvailableBackups(project)
        if (availableBackups.length === 0) {
          throw new Error('没有可用的备份版本')
        }

        console.log(`📋 找到 ${availableBackups.length} 个历史备份:`)
        for (const [index, backup] of availableBackups.entries()) {
          console.log(`  ${index + 1}. ${backup.name} (${backup.timestamp})`)
        }

        if (targetVersion) {
          // 查找指定版本的备份
          const targetBackup = availableBackups.find((backup) => backup.name.includes(`-v${targetVersion}`))
          if (!targetBackup) {
            throw new Error(`未找到版本 ${targetVersion} 的备份`)
          }

          backupPath = targetBackup.path
          console.log(`🎯 使用指定版本备份: ${targetBackup.name}`)
        } else {
          // 使用最新的历史备份
          backupPath = availableBackups[0].path
          console.log(`🔄 使用最新历史备份: ${availableBackups[0].name}`)
        }
      }

      return await this.performRollback(project, backupPath)
    } catch (error) {
      ErrorLogger.logError('回滚', error, { project, targetVersion })
      return DeployResult.error(error)
    }
  }

  /**
   * 执行实际的回滚操作
   */
  async performRollback(project, backupPath) {
    let targetDir
    try {
      // 优先使用当前配置的部署路径
      const actualDeployPath = await this.getActualDeployPath(project)

      if (actualDeployPath) {
        targetDir = actualDeployPath
        console.log(`📋 使用配置记录的部署路径: ${targetDir}`)
      } else {
        // 尝试从备份信息中获取原始目标目录
        const info = await fs.readJson(path.join(backupPath, 'backup-info.json')).catch(() => ({}))
        const defaultTarget = project === 'frontend' ? this.frontendDir : this.backendDir
        targetDir = info.sourceDir || defaultTarget
        console.log(`📋 使用${info.sourceDir ? '备份记录的' : '默认'}部署路径: ${targetDir}`)
      }
    } catch {
      targetDir = project === 'frontend' ? this.frontendDir : this.backendDir
      console.log(`📋 使用默认部署路径: ${targetDir}`)
    }

    console.log(`📂 目标目录: ${targetDir}`)

    try {
      // 清空目标目录
      console.log(`🔄 清空目标目录...`)
      await fs.emptyDir(targetDir)

      // 恢复备份版本
      console.log(`🔄 恢复备份版本: ${path.basename(backupPath)} -> ${targetDir}`)
      await fs.copy(backupPath, targetDir, {
        overwrite: true,
        filter: (src) => !src.endsWith('backup-info.json') // 排除备份信息文件
      })

      console.log(`✅ 回滚完成: ${project}`)
      ErrorLogger.logSuccess('回滚', { project, backupPath })

      return DeployResult.success('回滚成功', {
        deployPath: targetDir
      })
    } catch (rollbackError) {
      ErrorLogger.logError('回滚执行失败', rollbackError, { project, backupPath, targetDir })
      throw rollbackError
    }
  }

  /**
   * 获取可用的历史备份列表
   */
  async getAvailableBackups(project) {
    try {
      if (!(await fs.pathExists(this.backupDir))) {
        return []
      }

      const files = await fs.readdir(this.backupDir)
      const backupPattern = new RegExp(`^${project}-backup-(.+)$`)

      const backups = files
        .filter((file) => backupPattern.test(file) && !file.endsWith('-latest'))
        .map((file) => {
          const match = file.match(backupPattern)
          const timestamp = match[1]
          return {
            name: file,
            path: path.join(this.backupDir, file),
            timestamp
          }
        })
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp)) // 按时间倒序排列

      return backups
    } catch (error) {
      console.warn(`获取备份列表失败: ${error.message}`)
      return []
    }
  }

  async findBackupForRollback(project, targetVersion) {
    try {
      const backups = await fs.readdir(this.backupDir)
      const projectBackups = backups.filter((name) => name.startsWith(`${project}-`))

      if (projectBackups.length === 0) {
        return null
      }

      // 如果指定了版本，查找对应版本的备份
      if (targetVersion) {
        const versionBackup = projectBackups.find((name) => name.includes(`-v${targetVersion}`))
        if (versionBackup) {
          return path.join(this.backupDir, versionBackup)
        }
      }

      // 否则返回最新的备份（按时间戳排序）
      projectBackups.sort((a, b) => {
        const timeA = a.split('-')[1]
        const timeB = b.split('-')[1]
        return Number.parseInt(timeB) - Number.parseInt(timeA)
      })

      return path.join(this.backupDir, projectBackups[0])
    } catch (error) {
      ErrorLogger.logError('查找备份', error, { project, targetVersion })
      return null
    }
  }

  async restoreBackup(project) {
    const backupPath = await this.findBackupForRollback(project)
    if (backupPath) {
      try {
        // 优先使用当前配置的部署路径
        const actualDeployPath = await this.getActualDeployPath(project)
        let targetDir

        if (actualDeployPath) {
          targetDir = actualDeployPath
        } else {
          const infoPath = path.join(backupPath, 'backup-info.json')
          const info = await fs.readJson(infoPath).catch(() => ({}))
          const defaultTarget = project === 'frontend' ? this.frontendDir : this.backendDir
          targetDir = info.sourceDir || defaultTarget
        }

        await fs.emptyDir(targetDir)
        await fs.copy(backupPath, targetDir, {
          overwrite: true,
          filter: (src) => !src.endsWith('backup-info.json')
        })
      } catch {
        const defaultTarget = project === 'frontend' ? this.frontendDir : this.backendDir
        const targetDir = await this.getActualDeployPath(project).catch(() => defaultTarget) || defaultTarget
        await fs.copy(backupPath, targetDir, { overwrite: true })
      }
    }
  }

  async getCurrentVersion(project) {
    // 参数验证
    if (!project) {
      throw new Error('project 参数不能为空')
    }
    if (!['frontend', 'backend'].includes(project)) {
      throw new Error('project 必须是 frontend 或 backend')
    }
    try {
      // 获取实际配置的部署路径
      const actualDeployPath = await this.getActualDeployPath(project)
      const targetDir = actualDeployPath || (project === 'frontend' ? this.frontendDir : this.backendDir)
      const versionFile = path.join(targetDir, 'version.json')

      if (await fs.pathExists(versionFile)) {
        const versionInfo = await fs.readJson(versionFile)
        return {
          success: true,
          ...versionInfo,
          deployPath: actualDeployPath // 返回实际配置的部署路径
        }
      }

      return {
        success: true,
        project,
        version: 'unknown',
        deployTime: null,
        deployPath: actualDeployPath // 返回实际配置的部署路径
      }
    } catch (error) {
      return {
        success: false,
        project,
        version: 'error',
        deployPath: await this.getActualDeployPath(project).catch(() =>
          project === 'frontend' ? this.frontendDir : this.backendDir
        ),
        error: error.message
      }
    }
  }

  /**
   * 获取实际配置的部署路径
   */
  async getActualDeployPath(project) {
    // 参数验证
    if (!project) {
      throw new Error('project 参数不能为空')
    }
    try {
      // 使用配置的配置目录路径
      const deployPathsFile = path.join(this.constants.configDir, this.constants.deployPathsConfigFile)

      if (await fs.pathExists(deployPathsFile)) {
        const deployPaths = await fs.readJson(deployPathsFile)
        return deployPaths[project]?.deployPath || null
      }

      return null
    } catch (error) {
      console.warn(`读取部署路径配置失败: ${error.message}`)
      return null
    }
  }

  /**
   * 获取配置文件中记录的部署版本
   */
  async getActualDeployVersion(project) {
    // 参数验证
    if (!project) {
      throw new Error('project 参数不能为空')
    }
    try {
      // 使用配置的配置目录路径
      const deployPathsFile = path.join(this.constants.configDir, this.constants.deployPathsConfigFile)

      if (await fs.pathExists(deployPathsFile)) {
        const deployPaths = await fs.readJson(deployPathsFile)
        return deployPaths[project]?.version || null
      }

      return null
    } catch (error) {
      console.warn(`读取部署版本配置失败: ${error.message}`)
      return null
    }
  }

  /**
   * 初始化部署路径配置文件
   */
  async initializeDeployPathsConfig() {
    try {
      const deployPathsFile = path.join(this.constants.configDir, this.constants.deployPathsConfigFile)

      // 确保配置目录存在
      await fs.ensureDir(path.dirname(deployPathsFile))

      // 如果配置文件不存在，创建初始配置
      if (await fs.pathExists(deployPathsFile)) {
        console.log('📋 部署路径配置文件已存在')
      } else {
        const initialConfig = {
          frontend: {
            deployPath: null,
            updatedAt: null
          },
          backend: {
            deployPath: null,
            updatedAt: null
          }
        }

        await fs.writeJson(deployPathsFile, initialConfig, { spaces: 2 })
        console.log('📝 创建初始部署路径配置文件')
      }
    } catch (error) {
      console.warn(`初始化部署路径配置失败: ${error.message}`)
    }
  }

  /**
   * 更新部署路径配置文件
   */
  async updateDeployPathConfig(project, deployPath, version = null) {
    // 参数验证
    if (!project || !deployPath) {
      throw new Error('project 和 deployPath 参数不能为空')
    }
    try {
      const deployPathsFile = path.join(this.constants.configDir, this.constants.deployPathsConfigFile)
      let deployPaths = {}

      // 读取现有配置（如果存在）
      if (await fs.pathExists(deployPathsFile)) {
        deployPaths = await fs.readJson(deployPathsFile)
      }

      // 确保项目配置存在
      deployPaths[project] ||= {}

      // 更新部署路径、版本号和时间戳
      deployPaths[project].deployPath = deployPath
      deployPaths[project].version = version
      deployPaths[project].updatedAt = new Date().toISOString()

      // 确保配置目录存在
      await fs.ensureDir(path.dirname(deployPathsFile))

      // 写入配置文件
      await fs.writeJson(deployPathsFile, deployPaths, { spaces: 2 })

      console.log(`✅ 更新部署路径配置: ${project} -> ${deployPath}${version ? ` (版本: ${version})` : ''}`)

      // 通知服务器端部署路径已更新
      await this.notifyServerDeployPathUpdate(project, deployPath, version)
    } catch (error) {
      console.warn(`更新部署路径配置失败: ${error.message}`)
    }
  }

  /**
   * 通知服务器端部署路径已更新
   */
  async notifyServerDeployPathUpdate(project, deployPath, version = null) {
    try {
      if (!this.agent || !this.agent.socketHandler) {
        console.warn('无法通知服务器：缺少 agent 或 socket 连接')
        return
      }

      const notification = {
        type: 'deploy-path-updated',
        data: {
          project,
          deployPath,
          version,
          updatedAt: new Date().toISOString()
        }
      }

      // 通过 socket 发送通知
      this.agent.socketHandler.sendNotification('deployPathUpdated', notification)
      console.log(`📡 已通知服务器：${project} 部署路径更新为 ${deployPath}${version ? ` (版本: ${version})` : ''}`)
    } catch (error) {
      console.warn(`通知服务器失败: ${error.message}`)
    }
  }

  /**
   * 清理旧备份（可选功能）
   * 只有在配置了 maxBackups 且大于0时才会执行清理
   */
  async cleanupOldBackups(project) {
    // 参数验证
    if (!project) {
      throw new Error('project 参数不能为空')
    }
    try {
      if (!this.maxBackups || this.maxBackups <= 0) {
        console.log(`🗂 未配置备份数量限制，保留所有 ${project} 备份`)
        return
      }

      const availableBackups = await this.getAvailableBackups(project)

      // 排除最新备份链接，只清理历史备份
      const historicalBackups = availableBackups.filter((backup) => !backup.name.endsWith('-latest'))

      // 保留最新的 maxBackups 个备份，删除其余的
      if (historicalBackups.length > this.maxBackups) {
        const toDelete = historicalBackups.slice(this.maxBackups)

        console.log(`🗑 开始清理 ${project} 的旧备份，保留最新 ${this.maxBackups} 个备份`)

        // 并行删除旧备份，提高性能
        const deletePromises = toDelete.map(async (backup) => {
          try {
            await fs.remove(backup.path)
            console.log(`♻️ 已清理旧备份: ${backup.name}`)
            return { success: true, backup: backup.name }
          } catch (error) {
            console.error(`❌ 清理备份失败 ${backup.name}:`, error.message)
            return { success: false, backup: backup.name, error: error.message }
          }
        })

        const results = await Promise.allSettled(deletePromises)
        const successCount = results.filter((r) => r.status === 'fulfilled' && r.value.success).length
        const failCount = results.length - successCount

        console.log(`✅ 备份清理完成: 成功 ${successCount} 个，失败 ${failCount} 个`)
      } else {
        console.log(`ℹ️ ${project} 备份数量 (${historicalBackups.length}) 未超过限制 (${this.maxBackups})，无需清理`)
      }
    } catch (error) {
      ErrorLogger.logWarning('清理旧备份', error.message, { project })
    }
  }

  /**
   * 获取备份摘要信息
   */
  async getBackupSummary(project) {
    // 参数验证
    if (!project) {
      throw new Error('project 参数不能为空')
    }
    try {
      const availableBackups = await this.getAvailableBackups(project)
      const latestBackupPath = path.join(this.backupDir, `${project}-latest`)
      const hasLatestBackup = await fs.pathExists(latestBackupPath)

      return {
        project,
        totalBackups: availableBackups.length,
        hasLatestBackup,
        latestBackup: availableBackups.length > 0 ? availableBackups[0].name : null,
        backups: availableBackups.slice(0, 5), // 只返回最新的5个备份信息
        backupDir: this.backupDir
      }
    } catch (error) {
      return {
        project,
        error: error.message,
        totalBackups: 0,
        hasLatestBackup: false
      }
    }
  }
}
