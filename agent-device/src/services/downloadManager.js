// 中文注释：ESM 导入
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';

export default class DownloadManager {
  constructor(config) {
    this.config = config;
    this.serverUrl = config.server.url;
    this.tempDir = config.download.tempDir;
    this.packageDir = config.download.packageDir;
    this.maxRetries = config.download.maxRetries;
    this.retryDelay = config.download.retryDelay;
  }
  
  async downloadPackage(project, fileName) {
    console.log(`开始下载包: ${project}/${fileName}`);
    
    try {
      // 1. 获取包信息
      const packageInfo = await this.getPackageInfo(project, fileName);
      if (!packageInfo) {
        throw new Error('包信息不存在');
      }
      
      const targetPath = path.join(this.packageDir, project, fileName);
      
      // 2. 检查是否已存在且完整  
      const expectedMd5 = packageInfo.fileMd5 || packageInfo.md5;
      if (await this.isFileComplete(targetPath, expectedMd5)) {
        console.log('文件已存在且完整，跳过下载');
        return {
          success: true,
          filePath: targetPath,
          cached: true
        };
      }
      
      // 3. 执行分片下载
      const downloadResult = await this.downloadWithChunks(
        project, 
        fileName, 
        packageInfo,
        targetPath
      );
      
      return downloadResult;
      
    } catch (error) {
      console.error('下载失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  async getPackageInfo(project, fileName) {
    try {
      const url = `${this.serverUrl}/packages/${project}/${fileName}`;
      const response = await axios.get(url);
      
      if (response.data.success) {
        return response.data.package || response.data.data;
      } else {
        throw new Error(response.data.error || '获取包信息失败');
      }
    } catch (error) {
      console.error('获取包信息失败:', error.message);
      return null;
    }
  }
  
  async downloadWithChunks(project, fileName, packageInfo, targetPath) {
    console.log('开始分片下载...');
    
    const tempPath = path.join(this.tempDir, `${project}-${fileName}`);
    await fs.ensureDir(path.dirname(tempPath));
    await fs.ensureDir(path.dirname(targetPath));
    
    try {
      // 创建临时文件
      const tempFile = await fs.createWriteStream(tempPath);
      let downloadedBytes = 0;
      
      // 检查是否支持断点续传
      const existingSize = await this.getFileSize(tempPath);
      if (existingSize > 0) {
        console.log(`检测到未完成下载，继续从 ${existingSize} 字节开始`);
        downloadedBytes = existingSize;
      }
      
      const downloadUrl = `${this.serverUrl}/packages/${project}/${fileName}/download`;
      
      // 设置下载请求头
      const headers = {};
      if (downloadedBytes > 0) {
        headers['Range'] = `bytes=${downloadedBytes}-`;
        // 追加模式打开文件
        tempFile.close();
        const appendStream = fs.createWriteStream(tempPath, { flags: 'a' });
      }
      
      // 执行下载
      const response = await axios({
        method: 'GET',
        url: downloadUrl,
        headers,
        responseType: 'stream'
      });
      
      const totalBytes = parseInt(response.headers['content-length'] || '0') + downloadedBytes;
      
      return new Promise((resolve, reject) => {
        const stream = downloadedBytes > 0 
          ? fs.createWriteStream(tempPath, { flags: 'a' })
          : tempFile;
          
        response.data.pipe(stream);
        
        let receivedBytes = downloadedBytes;
        response.data.on('data', (chunk) => {
          receivedBytes += chunk.length;
          const progress = ((receivedBytes / totalBytes) * 100).toFixed(1);
          process.stdout.write(`\r下载进度: ${progress}% (${receivedBytes}/${totalBytes} bytes)`);
        });
        
        stream.on('finish', async () => {
          console.log('\n下载完成，验证文件完整性...');
          
          try {
            // 验证 MD5
            const fileMd5 = await this.calculateMd5(tempPath);
            const expectedMd5 = packageInfo.fileMd5 || packageInfo.md5;
            if (fileMd5 !== expectedMd5) {
              throw new Error(`文件校验失败，期望: ${expectedMd5}，实际: ${fileMd5}`);
            }
            
            // 移动到最终位置
            await fs.move(tempPath, targetPath, { overwrite: true });
            
            console.log('文件下载并验证成功');
            resolve({
              success: true,
              filePath: targetPath,
              cached: false
            });
          } catch (error) {
            reject(error);
          }
        });
        
        stream.on('error', reject);
        response.data.on('error', reject);
      });
      
    } catch (error) {
      // 清理临时文件
      await fs.remove(tempPath).catch(() => {});
      throw error;
    }
  }
  
  async isFileComplete(filePath, expectedMd5) {
    try {
      if (!await fs.pathExists(filePath)) {
        return false;
      }

      const fileMd5 = await this.calculateMd5(filePath);
      return fileMd5 === expectedMd5;
    } catch (error) {
      return false;
    }
  }
  
  async getFileSize(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch (error) {
      return 0;
    }
  }
  
  async calculateMd5(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5');
      const stream = fs.createReadStream(filePath);
      
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }
  
  async cleanupTempFiles() {
    try {
      // 清理超过 24 小时的临时文件
      const files = await fs.readdir(this.tempDir);
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 小时
      
      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtimeMs > maxAge) {
          await fs.remove(filePath);
          console.log(`清理临时文件: ${file}`);
        }
      }
    } catch (error) {
      console.error('清理临时文件失败:', error);
    }
  }
}