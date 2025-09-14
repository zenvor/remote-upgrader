// 中文注释：ESM 导入
import fs from 'fs-extra';
import path from 'path';
import { defaultPathValidator } from '../utils/pathValidator.js';
import { ErrorLogger, FileHelper, DeployResult, BackupHelper, VersionHelper } from '../utils/common.js';

export default class DeployManager {
  constructor(config) {
    this.config = config;
    this.frontendDir = config.deploy.frontendDir;
    this.backendDir = config.deploy.backendDir;
    this.backupDir = config.deploy.backupDir;
    this.maxBackups = config.deploy.maxBackups;
  }
  
  async deploy(project, packagePath, version, deployPathOverride = null) {
    console.log(`开始部署 ${project} 包: ${packagePath}`);

    try {
      const defaultTarget = project === 'frontend' ? this.frontendDir : this.backendDir;

      // 安全验证部署路径
      const pathValidation = defaultPathValidator.validateDeployPath(deployPathOverride, defaultTarget);
      const targetDir = pathValidation.path;

      if (!pathValidation.valid) {
        console.warn(`⚠️ 部署路径安全检查: ${pathValidation.reason}`);
      }

      // 检查路径访问权限
      const accessibility = await defaultPathValidator.checkPathAccessibility(targetDir);
      if (!accessibility.accessible) {
        throw new Error(`部署目录不可访问: ${accessibility.reason}`);
      }

      console.log(`✅ 使用安全验证后的部署路径: ${targetDir}`);
      
      // 1. 创建备份
      await this.createBackup(project, version, targetDir);
      
      // 2. 解压和部署
      const deployResult = await this.extractAndDeploy(packagePath, targetDir, project);
      
      if (!deployResult.success) {
        // 部署失败，尝试恢复备份
        console.log('部署失败，恢复备份...');
        await this.restoreBackup(project);
        throw new Error(deployResult.error);
      }
      
      // 3. 更新版本信息
      await this.updateVersionInfo(project, version, packagePath, targetDir);
      
      // 4. 重启服务（如果是后端）
      if (project === 'backend') {
        await this.restartBackendService();
      }
      
      // 5. 清理旧备份
      await this.cleanupOldBackups(project);
      
      ErrorLogger.logSuccess('部署', { project, version });
      return DeployResult.success('部署成功');
      
    } catch (error) {
      ErrorLogger.logError('部署', error, { project, version, packagePath });
      return DeployResult.error(error);
    }
  }
  
  async createBackup(project, version, sourceDirOverride = null) {
    const defaultSource = project === 'frontend' ? this.frontendDir : this.backendDir;
    const sourceDir = sourceDirOverride || defaultSource;
    const backupName = `${project}-${Date.now()}-v${version}`;
    const backupPath = path.join(this.backupDir, backupName);
    
    try {
      if (await FileHelper.safePathExists(sourceDir)) {
        console.log(`创建备份: ${backupName}`);
        await fs.copy(sourceDir, backupPath, {
          overwrite: false,
          errorOnExist: false
        });
        
        // 记录备份信息
        const backupInfo = BackupHelper.createBackupInfo(project, version, backupPath, sourceDir);
        await FileHelper.safeWriteJson(path.join(backupPath, 'backup-info.json'), backupInfo);
      }
    } catch (error) {
      ErrorLogger.logWarning('创建备份', error.message, { project, version });
      // 备份失败不阻止部署继续
    }
  }
  
  async extractAndDeploy(packagePath, targetDir, project) {
    try {
      // 确保目标目录存在
      await fs.ensureDir(targetDir);
      
      // 检查包文件类型
      const ext = path.extname(packagePath).toLowerCase();
      
      if (ext === '.zip') {
        return await this.extractZip(packagePath, targetDir);
      } else if (ext === '.tar' || ext === '.tgz' || ext === '.gz') {
        return await this.extractTar(packagePath, targetDir);
      } else {
        // 直接复制文件
        const fileName = path.basename(packagePath);
        const targetPath = path.join(targetDir, fileName);
        await FileHelper.safeCopy(packagePath, targetPath);
        return DeployResult.success('文件复制完成');
      }
    } catch (error) {
      return DeployResult.error(error);
    }
  }
  
  async extractZip(zipPath, targetDir) {
    return new Promise((resolve, reject) => {
      // 使用系统的 unzip 命令
      const unzip = spawn('unzip', ['-o', zipPath, '-d', targetDir], {
        stdio: 'pipe'
      });
      
      let stdout = '';
      let stderr = '';
      
      unzip.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      unzip.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      unzip.on('close', (code) => {
        if (code === 0) {
          console.log('ZIP 解压成功');
          resolve(DeployResult.success('ZIP 解压完成'));
        } else {
          ErrorLogger.logError('ZIP 解压', new Error(stderr));
          reject(new Error(`解压失败: ${stderr}`));
        }
      });
      
      unzip.on('error', (error) => {
        reject(error);
      });
    });
  }
  
  async extractTar(tarPath, targetDir) {
    return new Promise((resolve, reject) => {
      // 使用系统的 tar 命令
      const tar = spawn('tar', ['-xf', tarPath, '-C', targetDir], {
        stdio: 'pipe'
      });
      
      let stderr = '';
      
      tar.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      tar.on('close', (code) => {
        if (code === 0) {
          console.log('TAR 解压成功');
          resolve(DeployResult.success('TAR 解压完成'));
        } else {
          ErrorLogger.logError('TAR 解压', new Error(stderr));
          reject(new Error(`解压失败: ${stderr}`));
        }
      });
      
      tar.on('error', (error) => {
        reject(error);
      });
    });
  }
  
  async updateVersionInfo(project, version, packagePath, targetDirOverride = null) {
    const defaultTarget = project === 'frontend' ? this.frontendDir : this.backendDir;
    const targetDir = targetDirOverride || defaultTarget;
    const versionFile = path.join(targetDir, 'version.json');
    
    const versionInfo = VersionHelper.createVersionInfo(project, version, packagePath, this.config.device.id);
    await FileHelper.safeWriteJson(versionFile, versionInfo);
    console.log(`版本信息已更新: ${version}`);
  }
  
  async restartBackendService() {
    console.log('重启后端服务...');
    
    try {
      // 这里可以根据具体的部署环境来实现服务重启逻辑
      // 例如：systemctl restart service, pm2 restart, docker restart 等
      
      // 示例：如果是 Node.js 服务，可以通过信号重启
      if (process.env.BACKEND_PID) {
        process.kill(process.env.BACKEND_PID, 'SIGUSR2');
      }
      
      console.log('后端服务重启完成');
    } catch (error) {
      ErrorLogger.logWarning('后端服务重启', error.message);
      // 服务重启失败不影响部署结果
    }
  }
  
  async rollback(project, targetVersion) {
    console.log(`开始回滚 ${project} 到版本: ${targetVersion || '上一个版本'}`);
    
    try {
      // 查找合适的备份
      const backupPath = await this.findBackupForRollback(project, targetVersion);
      
      if (!backupPath) {
        throw new Error('未找到合适的备份进行回滚');
      }
      
      let targetDir;
      try {
        const info = await fs.readJson(path.join(backupPath, 'backup-info.json')).catch(() => ({}));
        const defaultTarget = project === 'frontend' ? this.frontendDir : this.backendDir;
        targetDir = info.sourceDir || defaultTarget;
      } catch (e) {
        targetDir = project === 'frontend' ? this.frontendDir : this.backendDir;
      }
      
      // 创建当前版本的备份
      await this.createBackup(project, 'pre-rollback');
      
      // 清空目标目录
      await fs.emptyDir(targetDir);
      
      // 恢复备份
      await fs.copy(backupPath, targetDir, {
        overwrite: true,
        filter: (src) => !src.endsWith('backup-info.json')
      });
      
      // 重启服务（如果是后端）
      if (project === 'backend') {
        await this.restartBackendService();
      }
      
      ErrorLogger.logSuccess('回滚', { project, targetVersion });
      return DeployResult.success('回滚成功');
      
    } catch (error) {
      ErrorLogger.logError('回滚', error, { project, targetVersion });
      return DeployResult.error(error);
    }
  }
  
  async findBackupForRollback(project, targetVersion) {
    try {
      const backups = await fs.readdir(this.backupDir);
      const projectBackups = backups.filter(name => name.startsWith(`${project}-`));
      
      if (projectBackups.length === 0) {
        return null;
      }
      
      // 如果指定了版本，查找对应版本的备份
      if (targetVersion) {
        const versionBackup = projectBackups.find(name => name.includes(`-v${targetVersion}`));
        if (versionBackup) {
          return path.join(this.backupDir, versionBackup);
        }
      }
      
      // 否则返回最新的备份（按时间戳排序）
      projectBackups.sort((a, b) => {
        const timeA = a.split('-')[1];
        const timeB = b.split('-')[1];
        return parseInt(timeB) - parseInt(timeA);
      });
      
      return path.join(this.backupDir, projectBackups[0]);
    } catch (error) {
      ErrorLogger.logError('查找备份', error, { project, targetVersion });
      return null;
    }
  }
  
  async restoreBackup(project) {
    const backupPath = await this.findBackupForRollback(project);
    if (backupPath) {
      try {
        const infoPath = path.join(backupPath, 'backup-info.json');
        const info = await fs.readJson(infoPath).catch(() => ({}));
        const defaultTarget = project === 'frontend' ? this.frontendDir : this.backendDir;
        const targetDir = info.sourceDir || defaultTarget;
        await fs.emptyDir(targetDir);
        await fs.copy(backupPath, targetDir, {
          overwrite: true,
          filter: (src) => !src.endsWith('backup-info.json')
        });
      } catch (e) {
        const targetDir = project === 'frontend' ? this.frontendDir : this.backendDir;
        await fs.copy(backupPath, targetDir, { overwrite: true });
      }
    }
  }
  
  async getCurrentVersion(project) {
    try {
      const targetDir = project === 'frontend' ? this.frontendDir : this.backendDir;
      const versionFile = path.join(targetDir, 'version.json');
      
      if (await fs.pathExists(versionFile)) {
        const versionInfo = await fs.readJson(versionFile);
        return versionInfo;
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
  
  async cleanupOldBackups(project) {
    try {
      const backups = await fs.readdir(this.backupDir);
      const projectBackups = backups
        .filter(name => name.startsWith(`${project}-`))
        .map(name => ({
          name,
          timestamp: parseInt(name.split('-')[1]) || 0
        }))
        .sort((a, b) => b.timestamp - a.timestamp);
      
      // 保留最新的 maxBackups 个备份，删除其余的
      if (projectBackups.length > this.maxBackups) {
        const toDelete = projectBackups.slice(this.maxBackups);
        
        for (const backup of toDelete) {
          const backupPath = path.join(this.backupDir, backup.name);
          await fs.remove(backupPath);
          console.log(`清理旧备份: ${backup.name}`);
        }
      }
    } catch (error) {
      ErrorLogger.logWarning('清理旧备份', error.message, { project });
    }
  }
}
