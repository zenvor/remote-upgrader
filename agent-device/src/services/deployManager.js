// 中文注释：ESM 导入
import AdmZip from 'adm-zip'
import fs from 'fs-extra'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { PROGRESS_STEPS, createProgressUpdate } from '../constants/progress.js'
import { BackupHelper, DateHelper, DeployResult, ErrorLogger, FileHelper, VersionHelper } from '../utils/common.js'
import { defaultPathValidator } from '../utils/pathValidator.js'

export default class DeployManager {
  constructor(config, agent = null) {
    // 参数验证
    if (!config) {
      throw new Error('配置参数不能为空')
    }

    this.config = config
    this.agent = agent // 添加 agent 引用用于通信

    // 进度回调管理
    this.progressCallbacks = new Map()
    this.currentSessions = new Map()

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
      // 只确保备份目录存在，不创建部署目录
      // 部署目录将在有实际部署需求时才创建
      await fs.ensureDir(this.backupDir)

      // 初始化部署路径配置文件
      await this.initializeDeployPathsConfig()

      console.log('✅ 部署管理器初始化完成')
      console.log(`📂 备份目录: ${this.backupDir}`)
      console.log(`🗂 备份策略: ${this.maxBackups > 0 ? `保留最新 ${this.maxBackups} 个` : '保留所有备份'}`)
      console.log(`ℹ️ 部署目录将从 deploy-paths.json 配置文件中获取`)
    } catch (error) {
      ErrorLogger.logError('部署管理器初始化', error)
      throw error
    }
  }

  /**
   * 注册进度回调
   * @param {string} sessionId - 会话ID
   * @param {Function} callback - 进度回调函数
   */
  registerProgressCallback(sessionId, callback) {
    if (!sessionId || typeof callback !== 'function') {
      throw new Error('sessionId 和 callback 参数必须有效')
    }
    this.progressCallbacks.set(sessionId, callback)
    console.log(`📊 注册进度回调: ${sessionId}`)
  }

  /**
   * 移除进度回调
   * @param {string} sessionId - 会话ID
   */
  removeProgressCallback(sessionId) {
    this.progressCallbacks.delete(sessionId)
    this.currentSessions.delete(sessionId)
    console.log(`🗑️ 移除进度回调: ${sessionId}`)
  }

  /**
   * 发送进度更新
   * @param {string} sessionId - 会话ID
   * @param {string} step - 当前步骤
   * @param {number} progress - 进度百分比 (0-100)
   * @param {string} message - 进度消息
   * @param {Error|null} error - 错误信息
   * @param {Object} metadata - 额外元数据
   */
  emitProgress(sessionId, step, progress = 0, message = '', error = null, metadata = {}) {
    if (!sessionId) return

    const callback = this.progressCallbacks.get(sessionId)
    if (!callback) return

    const deviceId =
      this.agent?.config?.device?.id ||
      this.agent?.config?.deviceId ||
      this.agent?.deviceId ||
      'unknown'

    const mergedMetadata = { ...(metadata || {}) }
    const status = mergedMetadata.status || (error ? 'error' : 'running')

    const progressUpdate = createProgressUpdate({
      sessionId,
      deviceId,
      step,
      progress,
      message,
      status,
      error,
      metadata: mergedMetadata
    })

    // 更新当前会话状态
    this.currentSessions.set(sessionId, {
      ...progressUpdate,
      startTime: this.currentSessions.get(sessionId)?.startTime || new Date().toISOString()
    })

    try {
      callback(progressUpdate)
      console.log(`📊 进度更新 [${sessionId}]: ${step} - ${progress}% - ${message}`)
    } catch (err) {
      console.error('进度回调执行失败:', err)
    }
  }

  async deploy(project, packagePath, version, deployPathOverride = null, preservedPaths = [], sessionId = null) {
    // 参数验证
    if (!project || !packagePath) {
      throw new Error('project 和 packagePath 参数不能为空')
    }
    if (!['frontend', 'backend'].includes(project)) {
      throw new Error('project 必须是 frontend 或 backend')
    }
    console.log(`开始部署 ${project} 包: ${packagePath}`)

    const operationType = 'upgrade'
    const progressMeta = (extra = {}) => ({ operationType, ...extra })

    // 初始化进度会话
    if (sessionId) {
      this.emitProgress(sessionId, PROGRESS_STEPS.PREPARING, 0, '开始部署流程', null, progressMeta())
    }

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

      if (sessionId) {
        this.emitProgress(
          sessionId,
          PROGRESS_STEPS.PREPARING,
          20,
          '环境检查完成，开始备份',
          null,
          progressMeta()
        )
      }

      // 1. 先备份当前运行的旧版本（如果存在）
      console.log(`🔄 检查并备份当前版本...`)
      const backupResult = await this.backupCurrentVersion(project, targetDir, sessionId, preservedPaths)

      if (sessionId) {
        this.emitProgress(
          sessionId,
          PROGRESS_STEPS.DOWNLOADING,
          40,
          '备份完成，开始解压部署包',
          null,
          progressMeta()
        )
      }

      // 2. 解压和部署新版本
      console.log(`🔄 开始部署新版本 ${version}...`)
      if (preservedPaths.length > 0) {
        console.log(`🛡️ 启用白名单保护，保护路径: ${preservedPaths.join(', ')}`)
      }
      const deployResult = await this.extractAndDeploy(packagePath, targetDir, project, preservedPaths, sessionId)

      if (!deployResult.success) {
        // 部署失败，尝试恢复备份
        console.log('❌ 部署失败，恢复旧版本...')
        if (sessionId) {
          this.emitProgress(
            sessionId,
            PROGRESS_STEPS.FAILED,
            40,
            '部署失败，正在恢复备份',
            new Error(deployResult.error),
            progressMeta({ status: 'error' })
          )
        }
        await this.restoreBackup(project)
        throw new Error(deployResult.error)
      }

      if (sessionId) {
        this.emitProgress(
          sessionId,
          PROGRESS_STEPS.VERIFYING,
          85,
          '部署完成，更新版本信息',
          null,
          progressMeta()
        )
      }

      // 3. 更新版本信息
      await this.updateVersionInfo(project, version, packagePath, targetDir)

      // 4. 更新部署路径配置
      await this.updateDeployPathConfig(project, targetDir, version)

      if (sessionId) {
        this.emitProgress(
          sessionId,
          PROGRESS_STEPS.CLEANING,
          95,
          '清理临时文件',
          null,
          progressMeta()
        )
      }

      // 5. 可选清理旧备份（默认保留所有备份）
      if (this.maxBackups && this.maxBackups > 0) {
        await this.cleanupOldBackups(project)
      }

      if (sessionId) {
        this.emitProgress(
          sessionId,
          PROGRESS_STEPS.COMPLETED,
          100,
          '部署成功完成',
          null,
          progressMeta({ status: 'completed' })
        )
      }

      ErrorLogger.logSuccess('部署', { project, version })
      return DeployResult.success('部署成功', {
        deployPath: targetDir,
        backupCreated: backupResult.success,
        backupPath: backupResult.backupPath
      })
    } catch (error) {
      ErrorLogger.logError('部署', error, { project, version, packagePath })
      if (sessionId) {
        this.emitProgress(
          sessionId,
          PROGRESS_STEPS.FAILED,
          100,
          error?.message || '部署失败',
          error,
          progressMeta({ status: 'error' })
        )
      }
      return DeployResult.error(error)
    }
  }

  /**
   * 备份当前运行的版本（在部署新版本之前）
   */
  async backupCurrentVersion(project, targetDir, sessionId = null, preservedPaths = []) {
    try {
      const progressMeta = (extra = {}) => ({ operationType: 'upgrade', ...extra })

      if (sessionId) {
        this.emitProgress(sessionId, PROGRESS_STEPS.BACKUP, 0, '检查当前版本', null, progressMeta())
      }

      // 检查目标目录是否有内容
      const hasExisting = await this.hasContent(targetDir)
      if (!hasExisting) {
        console.log(`ℹ️ 部署目录为空，跳过备份: ${targetDir}`)
        if (sessionId) {
          this.emitProgress(
            sessionId,
            PROGRESS_STEPS.BACKUP,
            100,
            '目录为空，跳过备份',
            null,
            progressMeta({ status: 'completed' })
          )
        }
        return { success: false, reason: 'target_empty' }
      }

      if (sessionId) {
        this.emitProgress(sessionId, PROGRESS_STEPS.BACKUP, 20, '读取当前版本信息', null, progressMeta())
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
      const now = new Date()
      const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`
      const backupName = `${project}-backup-${timestamp}-from-${currentVersion}`
      const backupPath = path.join(this.backupDir, backupName)

      if (sessionId) {
        this.emitProgress(sessionId, PROGRESS_STEPS.BACKUP, 40, '清理旧备份链接', null, progressMeta())
      }

      // 删除旧的最新备份链接（如果存在）
      const latestBackupLink = path.join(this.backupDir, `${project}-latest`)
      if (await fs.pathExists(latestBackupLink)) {
        await fs.remove(latestBackupLink)
        console.log(`♻️ 已移除旧备份: ${project}-latest`)
      }

      if (sessionId) {
        this.emitProgress(sessionId, PROGRESS_STEPS.BACKUP, 60, '备份当前版本文件', null, progressMeta())
      }

      // 创建新备份（忽略保护白名单文件，因为它们不会被替换）
      if (preservedPaths.length > 0) {
        console.log(`🛡️ 备份时将忽略保护白名单文件: ${preservedPaths.join(', ')}`)
        await this.copyWithBackupExclusion(targetDir, backupPath, preservedPaths)
      } else {
        // 没有白名单，使用标准复制
        await fs.copy(targetDir, backupPath)
      }
      console.log(`📦 已备份旧版本: ${backupName}`)

      if (sessionId) {
        this.emitProgress(sessionId, PROGRESS_STEPS.BACKUP, 90, '创建备份链接', null, progressMeta())
      }

      // 创建新的最新备份链接（使用软链接）
      await this.createBackupSymlink(backupPath, latestBackupLink, `${project}-latest`)
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

      if (sessionId) {
        this.emitProgress(sessionId, PROGRESS_STEPS.BACKUP, 100, '备份完成', null, progressMeta({ status: 'completed' }))
      }

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

  /**
   * 创建备份符号链接（跨平台支持）
   * @param {string} targetPath - 目标路径（备份目录）
   * @param {string} linkPath - 符号链接路径
   * @param {string} linkName - 链接名称（用于日志）
   */
  async createBackupSymlink(targetPath, linkPath, linkName) {
    try {
      // 统一转换为绝对路径，避免符号链接解析出错
      const absoluteTargetPath = path.isAbsolute(targetPath)
        ? targetPath
        : path.resolve(targetPath)

      // 检查目标路径是否存在
      if (!(await fs.pathExists(absoluteTargetPath))) {
        throw new Error(`目标备份路径不存在: ${absoluteTargetPath}`)
      }

      // 删除旧的链接（如果存在）
      if (await fs.pathExists(linkPath)) {
        await fs.remove(linkPath)
        console.log(`♻️ 删除旧的备份链接: ${linkName}`)
      }

      try {
        // 尝试创建符号链接
        await fs.symlink(absoluteTargetPath, linkPath, 'junction')
        console.log(`🔗 创建符号链接成功: ${linkName} -> ${path.basename(absoluteTargetPath)}`)

        // 验证符号链接是否成功创建
        const linkStats = await fs.lstat(linkPath)
        if (linkStats.isSymbolicLink()) {
          console.log(`✅ 符号链接验证成功`)
          return { success: true, method: 'symlink' }
        }
      } catch (symlinkError) {
        console.warn(`⚠️ 符号链接创建失败: ${symlinkError.message}`)

        // Windows 特定的符号链接尝试
        if (process.platform === 'win32') {
          try {
            // 在 Windows 上尝试目录连接
            await fs.symlink(absoluteTargetPath, linkPath, 'dir')
            console.log(`🔗 Windows 目录符号链接成功: ${linkName}`)

            const linkStats = await fs.lstat(linkPath)
            if (linkStats.isSymbolicLink()) {
              return { success: true, method: 'windows-dir-symlink' }
            }
          } catch (winSymlinkError) {
            console.warn(`⚠️ Windows 目录符号链接失败: ${winSymlinkError.message}`)
          }
        }

        // 符号链接失败，回退到硬拷贝（保持原有行为）
        console.log(`📂 回退到文件复制模式: ${linkName}`)
        await fs.copy(absoluteTargetPath, linkPath)
        console.log(`✅ 文件复制完成: ${linkName}`)
        return { success: true, method: 'copy' }
      }
    } catch (error) {
      ErrorLogger.logError('创建备份符号链接失败', error, {
        targetPath,
        absoluteTargetPath: path.isAbsolute(targetPath) ? targetPath : path.resolve(targetPath),
        linkPath,
        linkName
      })
      throw new Error(`无法创建备份链接 ${linkName}: ${error.message}`)
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

        // 创建新的最新备份链接（使用软链接）
        await this.createBackupSymlink(backupPath, latestBackupLink, `${project}-latest`)
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

  async extractAndDeploy(packagePath, targetDir, project, preservedPaths = [], sessionId = null) {
    // 参数验证
    if (!packagePath || !targetDir || !project) {
      throw new Error('packagePath, targetDir 和 project 参数不能为空')
    }
    try {
      const progressMeta = (extra = {}) => ({ operationType: 'upgrade', ...extra })

      if (sessionId) {
        this.emitProgress(sessionId, PROGRESS_STEPS.EXTRACTING, 0, '准备目标目录', null, progressMeta())
      }

      // 准备目标目录（使用通用方法）
      const prepareProgressCallback = sessionId ? (step, progress, message) => {
        this.emitProgress(sessionId, step, progress, message, null, progressMeta())
      } : null

      await this.prepareTargetDirectory(targetDir, preservedPaths, '部署', prepareProgressCallback)

      if (sessionId) {
        this.emitProgress(sessionId, PROGRESS_STEPS.EXTRACTING, 20, '开始解压部署包', null, progressMeta())
      }

      // 检查包文件类型
      const ext = path.extname(packagePath).toLowerCase()

      let extractResult
      if (ext === '.zip') {
        extractResult = await this.extractZip(packagePath, targetDir, preservedPaths, sessionId)
      } else if (ext === '.tar' || ext === '.tgz' || ext === '.gz') {
        throw new Error(`不支持的压缩格式: ${ext}。仅支持 ZIP 格式，请重新打包为 ZIP 文件。`)
      } else {
        // 直接复制文件（支持白名单保护）
        const fileName = path.basename(packagePath)
        const fileTargetPath = path.join(targetDir, fileName)

        // 检查是否被白名单保护
        if (!this.isPathPreserved(fileName, preservedPaths)) {
          await FileHelper.safeCopy(packagePath, fileTargetPath)
          extractResult = DeployResult.success('文件复制完成')
        } else {
          console.log(`🛡️ 跳过白名单保护文件: ${fileName}`)
          extractResult = DeployResult.success('文件复制完成（跳过白名单文件）')
        }
      }

      if (sessionId) {
        this.emitProgress(sessionId, PROGRESS_STEPS.DEPLOYING, 80, '解压完成，验证结果', null, progressMeta())
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

  async extractZip(zipPath, targetDir, preservedPaths = []) {
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

      if (preservedPaths.length === 0) {
        // 没有白名单，使用快速解压
        zip.extractAllTo(targetDir, true)
        console.log(`✅ 使用快速解压模式`)
      } else {
        // 有白名单，使用选择性解压
        console.log(`🛡️ 使用白名单保护模式解压`)
        console.log(`🛡️ 保护路径: ${preservedPaths.join(', ')}`)

        let extractedCount = 0
        let skippedCount = 0
        const skippedFiles = []
        const loggedWhitelistEntries = new Set()

        for (const entry of zipEntries) {
          const entryPath = entry.entryName

          // 检查是否为白名单路径
          if (this.isPathPreserved(entryPath, preservedPaths)) {
            skippedCount++
            skippedFiles.push(entryPath)
            const topLevelEntry = this.getTopLevelEntry(entryPath)
            if (!loggedWhitelistEntries.has(topLevelEntry)) {
              console.log(`🛡️ 跳过白名单路径: ${topLevelEntry}`)
              loggedWhitelistEntries.add(topLevelEntry)
            }
            continue
          }

          // 解压非白名单文件
          try {
            if (entry.isDirectory) {
              // 创建目录
              const dirPath = path.join(targetDir, entryPath)
              // eslint-disable-next-line no-await-in-loop -- 需要顺序创建目录结构，避免并发冲突
              await fs.ensureDir(dirPath)
            } else {
              // 解压文件
              const filePath = path.join(targetDir, entryPath)
              const fileDir = path.dirname(filePath)
              // eslint-disable-next-line no-await-in-loop -- 需要在写入前确保父目录存在
              await fs.ensureDir(fileDir)
              const content = entry.getData()
              // eslint-disable-next-line no-await-in-loop -- 顺序写入以降低文件系统竞争风险
              await fs.writeFile(filePath, content)
            }
            extractedCount++
          } catch (extractError) {
            console.error(`❌ 解压文件失败: ${entryPath} - ${extractError.message}`)
            // 继续解压其他文件，不中断整个过程
          }
        }

        console.log(`✅ 选择性解压完成:`)
        console.log(`  📁 解压文件数: ${extractedCount}`)
        console.log(`  🛡️ 跳过文件数: ${skippedCount}`)

        if (skippedFiles.length > 0 && skippedFiles.length <= 10) {
          console.log(`  🛡️ 跳过的文件: ${skippedFiles.join(', ')}`)
        } else if (skippedFiles.length > 10) {
          console.log(`  🛡️ 跳过的文件: ${skippedFiles.slice(0, 10).join(', ')} ... 还有${skippedFiles.length - 10}个`)
        }
      }

      // 验证解压结果
      const afterFiles = await fs.readdir(targetDir)
      const totalFiles = afterFiles.length

      if (totalFiles === 0) {
        throw new Error('解压完成但目标目录为空')
      }

      console.log(`✅ ZIP 解压成功，目录总文件数: ${totalFiles}`)

      // 显示解压的主要文件
      const displayFiles = afterFiles.slice(0, 5)
      console.log(`📋 主要文件: ${displayFiles.join(', ')}${totalFiles > 5 ? ' ...' : ''}`)

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
   * @param {string} targetDir - 目标目录
   * @param {Array} preservedPaths - 白名单路径，这些文件/目录不会被删除
   */
  async ensureDirectoryEmpty(targetDir, preservedPaths = [], progressCallback = null) {
    try {
      if (preservedPaths.length === 0) {
        // 没有白名单，使用原有的快速清空方法
        console.log(`🔧 方法1：使用 fs.emptyDir 清空目录...`)
        if (progressCallback) {
          progressCallback(20, '清理目录文件...')
        }
        await fs.emptyDir(targetDir)
        console.log(`✅ fs.emptyDir 执行完成`)

        // 严格验证清空结果
        const afterFiles = await fs.readdir(targetDir)
        console.log(`📁 清空后文件数量: ${afterFiles.length}`)

        if (afterFiles.length > 0) {
          console.warn(`⚠️ fs.emptyDir 未完全清空，剩余文件: ${afterFiles.join(', ')}`)
          if (progressCallback) {
            progressCallback(60, '清理剩余文件...')
          }
          await this.forceEmptyDirectory(targetDir, afterFiles)
        } else {
          console.log(`✅ 目标目录清空成功`)
        }

        if (progressCallback) {
          progressCallback(100, '目录清理完成')
        }
        return
      }

      // 有白名单，使用选择性删除
      console.log(`🛡️ 使用白名单保护模式清空目录...`)
      console.log(`🛡️ 保护路径: ${preservedPaths.join(', ')}`)

      if (progressCallback) {
        progressCallback(10, '分析目录内容...')
      }

      const allFiles = await fs.readdir(targetDir)
      console.log(`📁 目录总文件数: ${allFiles.length}`)

      // 过滤出需要删除的文件（不在白名单中）
      const filesToDelete = []
      const preservedFiles = []

      for (const file of allFiles) {
        if (this.isPathPreserved(file, preservedPaths)) {
          preservedFiles.push(file)
        } else {
          filesToDelete.push(file)
        }
      }

      console.log(`🗑️ 需要删除的文件数: ${filesToDelete.length}`)
      console.log(`🛡️ 保护的文件数: ${preservedFiles.length}`)

      if (preservedFiles.length > 0) {
        console.log(`🛡️ 保护的文件/目录: ${preservedFiles.join(', ')}`)
      }

      if (progressCallback) {
        progressCallback(30, `删除 ${filesToDelete.length} 个文件...`)
      }

      // 删除非白名单文件
      let deletedCount = 0
      for (const file of filesToDelete) {
        const filePath = path.join(targetDir, file)
        try {
          // eslint-disable-next-line no-await-in-loop -- 顺序处理可降低文件系统竞争风险
          const stat = await fs.stat(filePath)
          // eslint-disable-next-line no-await-in-loop -- 需要顺序删除以避免目录依赖冲突
          await fs.remove(filePath)
          console.log(`${stat.isDirectory() ? '🗂️' : '📄'} 删除${stat.isDirectory() ? '目录' : '文件'}: ${file}`)
          deletedCount++

          // 更新删除进度
          if (progressCallback && filesToDelete.length > 0) {
            const deleteProgress = Math.min(90, 30 + (deletedCount / filesToDelete.length) * 60)
            progressCallback(deleteProgress, `已删除 ${deletedCount}/${filesToDelete.length} 个文件`)
          }
        } catch (removeError) {
          ErrorLogger.logError(`删除文件失败: ${file}`, removeError, { filePath })
          console.error(`❌ 删除文件失败: ${file} - ${removeError.message}`)
        }
      }

      if (progressCallback) {
        progressCallback(100, `选择性清理完成，保护了 ${preservedFiles.length} 个文件`)
      }
      console.log(`✅ 选择性清空完成，保护了 ${preservedFiles.length} 个文件/目录`)
    } catch (error) {
      ErrorLogger.logError('确保目录清空失败', error, { targetDir })
      throw new Error(`无法清空目标目录: ${error.message}`)
    }
  }

  /**
   * 检查路径是否在白名单中（受保护）
   * @param {string} filePath - 文件路径
   * @param {Array} preservedPaths - 白名单路径列表
   * @returns {boolean} 是否受保护
   */
  isPathPreserved(filePath, preservedPaths) {
    if (!preservedPaths || preservedPaths.length === 0) {
      return false
    }

    for (const preservedPattern of preservedPaths) {
      if (this.matchPath(filePath, preservedPattern)) {
        return true
      }
    }

    return false
  }

  /**
   * 路径匹配方法
   * @param {string} filePath - 文件路径
   * @param {string} pattern - 匹配模式
   * @returns {boolean} 是否匹配
   */
  matchPath(filePath, pattern) {
    // 精确匹配
    if (filePath === pattern) {
      return true
    }

    // 目录匹配：如果模式以 '/' 结尾，则匹配目录
    if (pattern.endsWith('/')) {
      const dirName = pattern.slice(0, -1)
      return filePath === dirName || filePath.startsWith(dirName + '/')
    }

    // 扩展：支持通配符匹配（可选）
    // 这里可以添加更复杂的模式匹配逻辑

    return false
  }

  /**
   * 获取路径的顶层条目（仅打印一级目录/文件）
   * @param {string} entryPath - 原始路径
   * @returns {string} 顶层条目名称
   */
  getTopLevelEntry(entryPath) {
    if (!entryPath || typeof entryPath !== 'string') {
      return entryPath
    }

    const normalized = entryPath.replace(/\\+/g, '/').replace(/^\/+/, '')
    const segments = normalized.split('/')
    return segments[0] || normalized
  }

  /**
   * 解析符号链接源路径
   * @param {string} sourcePath - 可能是符号链接的源路径
   * @returns {string} 实际的源路径
   */
  async resolveSymlinkSource(sourcePath) {
    try {
      const stats = await fs.lstat(sourcePath)
      if (stats.isSymbolicLink()) {
        const realPath = await fs.readlink(sourcePath)
        // 如果是相对路径，需要解析为绝对路径
        const resolvedPath = path.isAbsolute(realPath)
          ? realPath
          : path.resolve(path.dirname(sourcePath), realPath)

        console.log(`🔗 检测到符号链接: ${path.basename(sourcePath)} -> ${path.basename(resolvedPath)}`)

        // 验证实际路径是否存在
        if (await fs.pathExists(resolvedPath)) {
          return resolvedPath
        } else {
          console.warn(`⚠️ 符号链接目标不存在: ${resolvedPath}`)
          return sourcePath
        }
      }
      return sourcePath
    } catch (error) {
      console.warn(`⚠️ 解析符号链接失败: ${error.message}`)
      return sourcePath
    }
  }

  /**
   * 通用的文件复制方法（支持白名单保护）
   * @param {string} sourceDir - 源目录
   * @param {string} targetDir - 目标目录
   * @param {Array} preservedPaths - 白名单路径
   * @param {Object} options - 复制选项
   */
  async copyWithPreservation(sourceDir, targetDir, preservedPaths = [], options = {}) {
    const { overwrite = true, excludeFiles = ['backup-info.json'], logPrefix = '📂' } = options

    // 先解析符号链接，获取实际的源路径
    const actualSourceDir = await this.resolveSymlinkSource(sourceDir)

    console.log(`${logPrefix} 复制文件: ${path.basename(actualSourceDir)} -> ${path.basename(targetDir)}`)

    if (preservedPaths.length > 0) {
      console.log(`🛡️ 白名单保护: ${preservedPaths.join(', ')}`)
    }

    let copiedCount = 0
    let skippedCount = 0
    const loggedWhitelistEntries = new Set()

    await fs.copy(actualSourceDir, targetDir, {
      overwrite,
      filter: (src) => {
        const relativePath = path.relative(actualSourceDir, src)

        // 排除指定文件
        for (const excludeFile of excludeFiles) {
          if (src.endsWith(excludeFile)) {
            return false
          }
        }

        // 检查白名单保护
        if (preservedPaths.length > 0 && this.isPathPreserved(relativePath, preservedPaths)) {
          const topLevelEntry = this.getTopLevelEntry(relativePath)
          if (!loggedWhitelistEntries.has(topLevelEntry)) {
            console.log(`🛡️ 跳过白名单路径: ${topLevelEntry}`)
            loggedWhitelistEntries.add(topLevelEntry)
          }
          skippedCount++
          return false
        }

        copiedCount++
        return true
      }
    })

    console.log(`✅ 复制完成: ${copiedCount} 个文件，跳过 ${skippedCount} 个白名单文件`)
    return { copiedCount, skippedCount }
  }

  /**
   * 备份时的文件复制方法（排除保护白名单文件）
   * @param {string} sourceDir - 源目录
   * @param {string} targetDir - 目标目录
   * @param {Array} preservedPaths - 保护白名单路径（备份时要排除的）
   */
  async copyWithBackupExclusion(sourceDir, targetDir, preservedPaths = []) {
    // 解析符号链接，获取实际的源路径
    const actualSourceDir = await this.resolveSymlinkSource(sourceDir)

    console.log(`📦 备份复制文件: ${path.basename(actualSourceDir)} -> ${path.basename(targetDir)}`)
    console.log(`🛡️ 将排除保护白名单文件: ${preservedPaths.join(', ')}`)

    let copiedCount = 0
    let excludedCount = 0
    const loggedWhitelistEntries = new Set()

    await fs.copy(actualSourceDir, targetDir, {
      overwrite: true,
      filter: (src) => {
        const relativePath = path.relative(actualSourceDir, src)

        // 排除备份信息文件
        if (src.endsWith('backup-info.json')) {
          return false
        }

        // 排除保护白名单文件（它们不会被替换，所以无需备份）
        if (this.isPathPreserved(relativePath, preservedPaths)) {
          const topLevelEntry = this.getTopLevelEntry(relativePath)
          if (!loggedWhitelistEntries.has(topLevelEntry)) {
            console.log(`🛡️ 备份时排除保护路径: ${topLevelEntry}`)
            loggedWhitelistEntries.add(topLevelEntry)
          }
          excludedCount++
          return false
        }

        copiedCount++
        return true
      }
    })

    console.log(`✅ 备份完成: 复制了 ${copiedCount} 个文件，排除了 ${excludedCount} 个保护文件`)
    return { copiedCount, excludedCount }
  }

  /**
   * 准备目标目录（创建、清空、验证）
   * @param {string} targetDir - 目标目录路径
   * @param {Array} preservedPaths - 白名单保护路径
   * @param {string} operation - 操作类型（用于日志）
   * @param {Function} progressCallback - 进度回调
   */
  async prepareTargetDirectory(targetDir, preservedPaths = [], operation = '部署', progressCallback = null) {
    console.log(`🔍 ${operation}前目录状态检查: ${targetDir}`)

    // 确保目标目录存在
    await fs.ensureDir(targetDir)

    // 检查目录状态
    await this.checkDirectoryStatus(targetDir, `${operation}前`)

    // 清空目标目录（支持白名单保护）
    console.log(`🗑️ 开始清空目标目录: ${targetDir}`)

    // 创建删除进度回调包装器
    const deleteProgressCallback = progressCallback ? (progress, message) => {
      progressCallback('cleaning', progress, message)
    } : null

    await this.ensureDirectoryEmpty(targetDir, preservedPaths, deleteProgressCallback)

    // 清空后检查
    console.log(`🔍 清空后目录状态检查: ${targetDir}`)
    await this.checkDirectoryStatus(targetDir, '清空后')

    console.log(`✅ 目录准备完成: ${targetDir}`)
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

  async rollback(project, targetVersion = null, preservedPaths = [], sessionId = null) {
    // 参数验证
    if (!project) {
      throw new Error('project 参数不能为空')
    }
    if (!['frontend', 'backend'].includes(project)) {
      throw new Error('project 必须是 frontend 或 backend')
    }
    console.log(`开始回滚 ${project} 到版本: ${targetVersion || '最新备份'}`)
    if (preservedPaths.length > 0) {
      console.log(`🛡️ 回滚白名单保护: ${preservedPaths.join(', ')}`)
    }

    const operationType = 'rollback'
    const progressMeta = (extra = {}) => ({ operationType, ...extra })

    if (sessionId) {
      this.emitProgress(sessionId, PROGRESS_STEPS.PREPARING, 0, '开始回滚流程', null, progressMeta())
    }

    try {
      // 优先使用最新备份链接进行快速回滚
      const latestBackupDir = path.join(this.backupDir, `${project}-latest`)

      let backupPath
      if (!targetVersion && (await fs.pathExists(latestBackupDir))) {
        // 使用最新备份
        backupPath = latestBackupDir
        console.log(`📂 使用最新备份: ${project}-latest`)
        if (sessionId) {
          this.emitProgress(
            sessionId,
            PROGRESS_STEPS.PREPARING,
            20,
            '已定位最新回滚备份',
            null,
            progressMeta()
          )
        }
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

        if (sessionId) {
          this.emitProgress(
            sessionId,
            PROGRESS_STEPS.PREPARING,
            25,
            '已选择历史备份版本',
            null,
            progressMeta()
          )
        }
      }

      const result = await this.performRollback(project, backupPath, preservedPaths, sessionId)

      if (sessionId) {
        this.emitProgress(
          sessionId,
          PROGRESS_STEPS.COMPLETED,
          100,
          '回滚成功完成',
          null,
          progressMeta({ status: 'completed' })
        )
      }

      return result
    } catch (error) {
      ErrorLogger.logError('回滚', error, { project, targetVersion })
      if (sessionId) {
        this.emitProgress(
          sessionId,
          PROGRESS_STEPS.FAILED,
          100,
          error?.message || '回滚失败',
          error,
          progressMeta({ status: 'error' })
        )
      }
      return DeployResult.error(error)
    }
  }

  /**
   * 解析回滚目标版本号
   */
  async resolveRollbackVersion(project, backupPath) {
    let backupInfo = null
    let version = null

    try {
      const infoPath = path.join(backupPath, 'backup-info.json')
      if (await fs.pathExists(infoPath)) {
        backupInfo = await fs.readJson(infoPath)
        version = backupInfo?.originalVersion || null
      }
    } catch (error) {
      console.warn(`读取备份信息失败: ${error.message}`)
    }

    try {
      const versionFile = path.join(backupPath, 'version.json')
      if (await fs.pathExists(versionFile)) {
        const versionInfo = await fs.readJson(versionFile)
        if (versionInfo?.version && versionInfo.version !== 'unknown' && versionInfo.version !== 'error') {
          version = versionInfo.version
        }
      }
    } catch (error) {
      console.warn(`读取备份版本文件失败: ${error.message}`)
    }

    if (!version || version === 'unknown' || version === 'error') {
      const referenceTime = backupInfo?.backupTime || Date.now()
      version = DateHelper.formatToYYYYMMDDHHmm(referenceTime)
    }

    return version
  }

  /**
   * 确保回滚后的目录包含有效的版本信息
   */
  async ensureRollbackVersionFile(project, targetDir, version) {
    const versionFile = path.join(targetDir, 'version.json')
    const safeVersion = version || DateHelper.formatToYYYYMMDDHHmm(Date.now())

    try {
      if (await fs.pathExists(versionFile)) {
        const existing = await fs.readJson(versionFile)
        if (existing?.version && existing.version !== 'unknown' && existing.version !== 'error') {
          return
        }
      }

      const versionInfo = {
        project,
        version: safeVersion,
        deployTime: DateHelper.getCurrentDate(),
        source: 'rollback'
      }

      await FileHelper.safeWriteJson(versionFile, versionInfo)
    } catch (error) {
      console.warn(`写入回滚版本信息失败: ${error.message}`)
    }
  }

  /**
   * 执行实际的回滚操作
   */
  async performRollback(project, backupPath, preservedPaths = [], sessionId = null) {
    const rollbackVersion = await this.resolveRollbackVersion(project, backupPath)
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
      // 清空目标目录（支持白名单保护）
      console.log(`🔄 清空目标目录（回滚模式）...`)
      const progressMeta = (extra = {}) => ({ operationType: 'rollback', ...extra })
      if (sessionId) {
        this.emitProgress(sessionId, PROGRESS_STEPS.CLEANING, 40, '清理目标目录', null, progressMeta())
      }
      await this.ensureDirectoryEmpty(targetDir, preservedPaths)

      // 恢复备份版本（使用通用方法，支持白名单保护）
      if (sessionId) {
        this.emitProgress(sessionId, PROGRESS_STEPS.DEPLOYING, 70, '恢复备份文件', null, progressMeta())
      }
      await this.copyWithPreservation(backupPath, targetDir, preservedPaths, {
        overwrite: true,
        excludeFiles: ['backup-info.json'],
        logPrefix: '🔄'
      })

      console.log(`✅ 回滚完成: ${project}`)
      ErrorLogger.logSuccess('回滚', { project, backupPath })

      if (sessionId) {
        this.emitProgress(sessionId, PROGRESS_STEPS.VERIFYING, 85, '同步版本信息', null, progressMeta())
      }
      await this.ensureRollbackVersionFile(project, targetDir, rollbackVersion)
      await this.updateDeployPathConfig(project, targetDir, rollbackVersion)

      return DeployResult.success('回滚成功', {
        deployPath: targetDir,
        version: rollbackVersion
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

        // 准备目标目录（无白名单保护）
        await this.prepareTargetDirectory(targetDir, [], '备份恢复')

        // 使用通用复制方法
        await this.copyWithPreservation(backupPath, targetDir, [], {
          overwrite: true,
          excludeFiles: ['backup-info.json'],
          logPrefix: '🔄'
        })
      } catch {
        const defaultTarget = project === 'frontend' ? this.frontendDir : this.backendDir
        const targetDir = (await this.getActualDeployPath(project).catch(() => defaultTarget)) || defaultTarget

        // 备用恢复方法
        await this.copyWithPreservation(backupPath, targetDir, [], {
          overwrite: true,
          excludeFiles: ['backup-info.json'],
          logPrefix: '🔄'
        })
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
