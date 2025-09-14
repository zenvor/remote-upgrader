// 中文注释：ESM 导入
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  getPackageConfig as getConfig, 
  syncPackagesFromFileSystem, 
  addPackageRecord,
  removePackageRecord 
} from '../models/packageConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 获取包列表
 */
async function getPackages(ctx) {
  const { project } = ctx.query;
  
  if (project && !['frontend', 'backend'].includes(project)) {
    ctx.status = 400;
    ctx.body = {
      success: false,
      error: 'project 参数必须是 frontend 或 backend'
    };
    return;
  }

  try {
    // 先同步文件系统确保配置文件是最新的
    await syncPackagesFromFileSystem();
    
    const packages = [];
    const projects = project ? [project] : ['frontend', 'backend'];
    
    for (const proj of projects) {
      const packageDir = path.join(__dirname, '../../uploads/packages', proj);
      const manifestDir = path.join(__dirname, '../../manifests', proj);
      
      if (!await fs.pathExists(packageDir)) {
        continue;
      }
      
      const files = await fs.readdir(packageDir);
      
      for (const fileName of files) {
        const filePath = path.join(packageDir, fileName);
        const stats = await fs.stat(filePath);
        
        if (!stats.isFile()) continue;
        
        // 尝试读取 manifest 文件
        const manifestPath = path.join(manifestDir, `${fileName}.manifest.json`);
        let manifest = null;
        
        if (await fs.pathExists(manifestPath)) {
          try {
            manifest = await fs.readJSON(manifestPath);
          } catch (error) {
            console.warn(`读取 manifest 失败: ${manifestPath}`, error.message);
          }
        }
        
        packages.push({
          project: proj,
          fileName,
          fileSize: stats.size,
          fileMD5: manifest ? manifest.fileMD5 : null,
          packagePath: path.join('packages', proj, fileName),
          manifestPath: manifest ? path.join('manifests', proj, `${fileName}.manifest.json`) : null,
          manifest
        });
      }
    }
    
    // 按文件名降序排序以稳定输出
    packages.sort((a, b) => b.fileName.localeCompare(a.fileName));
    
    ctx.body = {
      success: true,
      packages,
      total: packages.length
    };
    
  } catch (error) {
    console.error('获取包列表失败:', error);
    ctx.status = 500;
    ctx.body = {
      success: false,
      error: '获取包列表失败'
    };
  }
}

/**
 * 获取包详情
 */
async function getPackageDetail(ctx) {
  const { project, fileName } = ctx.params;
  
  if (!['frontend', 'backend'].includes(project)) {
    ctx.status = 400;
    ctx.body = {
      success: false,
      error: 'project 参数必须是 frontend 或 backend'
    };
    return;
  }
  
  try {
    const packagePath = path.join(__dirname, '../../uploads/packages', project, fileName);
    const manifestPath = path.join(__dirname, '../../manifests', project, `${fileName}.manifest.json`);
    
    if (!await fs.pathExists(packagePath)) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        error: '包文件不存在'
      };
      return;
    }
    
    const stats = await fs.stat(packagePath);
    let manifest = null;
    
    if (await fs.pathExists(manifestPath)) {
      try {
        manifest = await fs.readJSON(manifestPath);
      } catch (error) {
        console.warn(`读取 manifest 失败: ${manifestPath}`, error.message);
      }
    }
    
    ctx.body = {
      success: true,
      package: {
        project,
        fileName,
        fileSize: stats.size,
        fileMD5: manifest ? manifest.fileMD5 : null,
        packagePath: path.join('packages', project, fileName),
        manifestPath: manifest ? path.join('manifests', project, `${fileName}.manifest.json`) : null,
        manifest
      }
    };
    
  } catch (error) {
    console.error('获取包详情失败:', error);
    ctx.status = 500;
    ctx.body = {
      success: false,
      error: '获取包详情失败'
    };
  }
}

/**
 * 删除包
 */
async function deletePackage(ctx) {
  const { project, fileName } = ctx.params;
  
  if (!['frontend', 'backend'].includes(project)) {
    ctx.status = 400;
    ctx.body = {
      success: false,
      error: 'project 参数必须是 frontend 或 backend'
    };
    return;
  }
  
  try {
    const packagePath = path.join(__dirname, '../../uploads/packages', project, fileName);
    const manifestPath = path.join(__dirname, '../../manifests', project, `${fileName}.manifest.json`);
    
    if (!await fs.pathExists(packagePath)) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        error: '包文件不存在'
      };
      return;
    }
    
    // 删除包文件
    await fs.remove(packagePath);
    
    // 删除 manifest 文件（如果存在）
    if (await fs.pathExists(manifestPath)) {
      await fs.remove(manifestPath);
    }
    
    // 从配置文件中删除记录
    await removePackageRecord(project, fileName);
    
    ctx.body = {
      success: true,
      message: '包删除成功'
    };
    
  } catch (error) {
    console.error('删除包失败:', error);
    ctx.status = 500;
    ctx.body = {
      success: false,
      error: '删除包失败'
    };
  }
}

/**
 * 下载包
 */
async function downloadPackage(ctx) {
  const { project, fileName } = ctx.params;
  
  if (!['frontend', 'backend'].includes(project)) {
    ctx.status = 400;
    ctx.body = {
      success: false,
      error: 'project 参数必须是 frontend 或 backend'
    };
    return;
  }
  
  try {
    const packagePath = path.join(__dirname, '../../uploads/packages', project, fileName);
    
    if (!await fs.pathExists(packagePath)) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        error: '包文件不存在'
      };
      return;
    }
    
    const stats = await fs.stat(packagePath);
    
    // 设置响应头
    ctx.set('Content-Type', 'application/zip');
    ctx.set('Content-Disposition', `attachment; filename="${fileName}"`);
    ctx.set('Content-Length', stats.size.toString());
    
    // 流式返回文件
    ctx.body = fs.createReadStream(packagePath);
    
  } catch (error) {
    console.error('下载包失败:', error);
    ctx.status = 500;
    ctx.body = {
      success: false,
      error: '下载包失败'
    };
  }
}

/**
 * 获取包管理配置
 */
async function getPackageConfig(ctx) {
  try {
    const config = await getConfig();
    
    ctx.body = {
      success: true,
      config
    };
    
  } catch (error) {
    console.error('获取包管理配置失败:', error);
    ctx.status = 500;
    ctx.body = {
      success: false,
      error: '获取配置失败'
    };
  }
}

export {
  getPackages,
  getPackageDetail,
  deletePackage,
  downloadPackage,
  getPackageConfig
};
