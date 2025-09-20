// 中文注释：ESM 导入
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { calculateFileHash } from '../utils/crypto.js';
import { addPackageRecord } from '../models/packageConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 从文件名中提取版本号
 */
function extractVersionFromFileName(fileName) {
  // 尝试匹配 v1.0.0 或 1.0.0 格式的版本号
  const versionMatch = fileName.match(/[v]?(\d+\.\d+\.\d+)/);
  return versionMatch ? versionMatch[1] : null;
}

// 中文注释：校验版本号（支持 v 前缀、预发布与构建元数据）
function isValidVersion(version) {
  const semverReg = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
  return semverReg.test(version.trim());
}

// 中文注释：规范化版本号（无 v 前缀则补上）
function normalizeVersion(version) {
  const v = version.trim();
  return v.startsWith('v') ? v : `v${v}`;
}

/**
 * 直接上传文件接口（简化版）
 */
async function directUpload(ctx) {
  // multer 中间件将文本字段放在 ctx.request.body，文件放在 ctx.file
  console.log('调试信息 - ctx.request.body:', ctx.request.body);
  console.log('调试信息 - ctx.file:', ctx.file);
  console.log('调试信息 - project 类型:', typeof ctx.request.body.project);
  
  const project = ctx.request.body.project;
  // 中文注释：前端可选传入的版本号
  const inputVersion = (ctx.request.body.version || '').trim();
  const file = ctx.file;

  // 参数验证
  if (!project || !file) {
    ctx.status = 400;
    ctx.body = {
      success: false,
      error: '缺少必要参数: project, file'
    };
    return;
  }

  if (!['frontend', 'backend'].includes(project)) {
    ctx.status = 400;
    ctx.body = {
      success: false,
      error: 'project 参数必须是 frontend 或 backend'
    };
    return;
  }

  try {
    // 检查目标目录
    const packageDir = path.join(__dirname, '../../uploads/packages', project);
    await fs.ensureDir(packageDir);
    
    const targetPath = path.join(packageDir, file.originalname);
    
    // 将文件从内存缓冲区写入磁盘
    await fs.writeFile(targetPath, file.buffer);
    
    // 计算文件MD5
    const fileMD5 = await calculateFileHash(targetPath);
    
    // 检查是否已存在相同MD5文件（秒传检查）
    const existingFiles = await fs.readdir(packageDir);
    for (const existingFile of existingFiles) {
      if (existingFile !== file.originalname) {
        const existingPath = path.join(packageDir, existingFile);
        const existingStat = await fs.stat(existingPath);
        if (existingStat.size === file.size) {
          const existingMD5 = await calculateFileHash(existingPath);
          if (existingMD5 === fileMD5) {
            // 发现重复文件，删除刚上传的文件
            await fs.unlink(targetPath);
            ctx.body = {
              success: true,
              done: true,
              message: `文件已存在（${existingFile}），秒传成功`,
              fileMD5,
              fileName: file.originalname,
              fileSize: file.size,
              packagePath: path.relative(path.join(__dirname, '../..'), existingPath)
            };
            return;
          }
        }
      }
    }

    // 提取或使用用户输入的版本信息
    let version;
    if (inputVersion) {
      if (!isValidVersion(inputVersion)) {
        ctx.status = 400;
        ctx.body = {
          success: false,
          error: '版本号不合法，示例：v1.2.3 或 1.2.3[-beta][+build]'
        };
        return;
      }
      version = normalizeVersion(inputVersion);
    } else {
      const extracted = extractVersionFromFileName(file.originalname);
      version = extracted ? normalizeVersion(extracted) : 'unknown';
    }

    // 添加包记录到配置中
    await addPackageRecord({
      project,
      version: version || 'unknown',
      fileName: file.originalname,
      filePath: path.relative(path.join(__dirname, '../..'), targetPath),
      fileSize: file.size,
      fileMD5: fileMD5,
      uploadedAt: new Date().toISOString()
    });

    ctx.body = {
      success: true,
      done: true,
      message: '文件上传完成',
      version,
      fileMD5,
      fileName: file.originalname,
      fileSize: file.size,
      packagePath: path.relative(path.join(__dirname, '../..'), targetPath)
    };

  } catch (error) {
    console.error('直接上传失败:', error);
    ctx.status = 500;
    ctx.body = {
      success: false,
      error: `上传失败: ${error.message}`
    };
  }
}

export {
  directUpload
};
