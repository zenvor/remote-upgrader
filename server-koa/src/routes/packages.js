// 中文注释：ESM 导入
import Router from '@koa/router';
import { 
  getPackages, 
  getPackageDetail, 
  deletePackage, 
  downloadPackage,
  getPackageConfig 
} from '../controllers/packageController.js';

const router = new Router({
  prefix: '/packages'
});

/**
 * @swagger
 * /packages:
 *   get:
 *     tags: [Packages]
 *     summary: 获取包列表
 *     description: 获取已上传的包文件列表，支持按项目类型筛选
 *     parameters:
 *       - name: project
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           enum: [frontend, backend]
 *         description: 项目类型筛选（可选）
 *         example: "frontend"
 *     responses:
 *       200:
 *         description: 包列表获取成功
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     packages:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           project:
 *                             type: string
 *                             enum: [frontend, backend]
 *                             description: 项目类型
 *                           fileName:
 *                             type: string
 *                             description: 文件名
 *                           fileSize:
 *                             type: integer
 *                             description: 文件大小（字节）
 *                           fileMD5:
 *                             type: string
 *                             nullable: true
 *                             description: 文件MD5值
 *                           packagePath:
 *                             type: string
 *                             description: 包文件相对路径
 *                           # manifests 机制已废弃
 *                       description: 包信息列表
 *                     total:
 *                       type: integer
 *                       description: 包总数
 *             example:
 *               success: true
 *               packages:
 *                 - project: "frontend"
 *                   fileName: "frontend-v1.0.0.zip"
 *                   fileSize: 10485760
 *                   fileMD5: "a1b2c3d4e5f6789012345678901234567890abcd"
 *                   version: "v1.0.0"
 *                   uploadedAt: "2025-09-10T10:30:00.000Z"
 *                   uploadedBy: "admin"
 *                   packagePath: "packages/frontend/frontend-v1.0.0.zip"
 *                 - project: "backend"
 *                   fileName: "backend-v1.0.0.zip"
 *                   fileSize: 20971520
 *                   fileMD5: "1234567890abcdef1234567890abcdef12345678"
 *                   version: "v1.0.0"
 *                   uploadedAt: "2025-09-10T10:30:00.000Z"
 *                   uploadedBy: "admin"
 *                   packagePath: "packages/backend/backend-v1.0.0.zip"
 *               total: 2
 *       400:
 *         description: 参数错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *             example:
 *               success: false
 *               error: "project 参数必须是 frontend 或 backend"
 *       500:
 *         description: 服务器内部错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *             example:
 *               success: false
 *               error: "获取包列表失败"
 */
router.get('/', getPackages);

/**
 * @swagger
 * /packages/{project}/{fileName}:
 *   get:
 *     tags: [Packages]
 *     summary: 获取包详情
 *     description: 获取指定包的详细信息
 *     parameters:
 *       - $ref: '#/components/parameters/ProjectParam'
 *       - $ref: '#/components/parameters/FileNameParam'
 *     responses:
 *       200:
 *         description: 包详情获取成功
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     package:
 *                       type: object
 *                       properties:
 *                         project:
 *                           type: string
 *                           enum: [frontend, backend]
 *                           description: 项目类型
 *                         fileName:
 *                           type: string
 *                           description: 文件名
 *                         fileSize:
 *                           type: integer
 *                           description: 文件大小（字节）
 *                         fileMD5:
 *                           type: string
 *                           nullable: true
 *                           description: 文件MD5值
 *                         version:
 *                           type: string
 *                           nullable: true
 *                           description: 包版本
 *                         uploadedAt:
 *                           type: string
 *                           format: date-time
 *                           nullable: true
 *                           description: 上传时间
 *                         uploadedBy:
 *                           type: string
 *                           nullable: true
 *                           description: 上传者
 *                         packagePath:
 *                           type: string
 *                           description: 包文件相对路径
 *             example:
 *               success: true
 *               package:
 *                 project: "frontend"
 *                 fileName: "frontend-v1.0.0.zip"
 *                 fileSize: 10485760
 *                 fileMD5: "a1b2c3d4e5f6789012345678901234567890abcd"
 *                 version: "v1.0.0"
 *                 uploadedAt: "2025-09-09T03:30:00.000Z"
 *                 uploadedBy: "admin"
 *                 packagePath: "packages/frontend/frontend-v1.0.0.zip"
 *       400:
 *         description: 参数错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *             example:
 *               success: false
 *               error: "project 参数必须是 frontend 或 backend"
 *       404:
 *         description: 包文件不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *             example:
 *               success: false
 *               error: "包文件不存在"
 *       500:
 *         description: 服务器内部错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *             example:
 *               success: false
 *               error: "获取包详情失败"
 */
router.get('/:project/:fileName', getPackageDetail);

/**
 * @swagger
 * /packages/{project}/{fileName}:
 *   delete:
 *     tags: [Packages]
 *     summary: 删除包
 *     description: 删除指定的包文件
 *     parameters:
 *       - $ref: '#/components/parameters/ProjectParam'
 *       - $ref: '#/components/parameters/FileNameParam'
 *     responses:
 *       200:
 *         description: 包删除成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *             example:
 *               success: true
 *               message: "包删除成功"
 *       400:
 *         description: 参数错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *             example:
 *               success: false
 *               error: "project 参数必须是 frontend 或 backend"
 *       404:
 *         description: 包文件不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *             example:
 *               success: false
 *               error: "包文件不存在"
 *       500:
 *         description: 服务器内部错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *             example:
 *               success: false
 *               error: "删除包失败"
 */
router.delete('/:project/:fileName', deletePackage);

/**
 * @swagger
 * /packages/{project}/{fileName}/download:
 *   get:
 *     tags: [Packages]
 *     summary: 下载包
 *     description: 下载指定的包文件
 *     parameters:
 *       - $ref: '#/components/parameters/ProjectParam'
 *       - $ref: '#/components/parameters/FileNameParam'
 *     responses:
 *       200:
 *         description: 文件下载成功
 *         content:
 *           application/zip:
 *             schema:
 *               type: string
 *               format: binary
 *               description: ZIP 文件内容
 *         headers:
 *           Content-Type:
 *             schema:
 *               type: string
 *             description: 文件类型
 *             example: "application/zip"
 *           Content-Disposition:
 *             schema:
 *               type: string
 *             description: 文件下载头
 *             example: 'attachment; filename="frontend-v1.0.0.zip"'
 *           Content-Length:
 *             schema:
 *               type: integer
 *             description: 文件大小
 *             example: 10485760
 *       400:
 *         description: 参数错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *             example:
 *               success: false
 *               error: "project 参数必须是 frontend 或 backend"
 *       404:
 *         description: 包文件不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *             example:
 *               success: false
 *               error: "包文件不存在"
 *       500:
 *         description: 服务器内部错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *             example:
 *               success: false
 *               error: "下载包失败"
 */
router.get('/:project/:fileName/download', downloadPackage);

/**
 * @swagger
 * /packages/config:
 *   get:
 *     tags: [Packages]
 *     summary: 获取包管理配置
 *     description: 获取包管理系统的配置信息，包括上传设置、存储配额等
 *     responses:
 *       200:
 *         description: 配置获取成功
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     config:
 *                       type: object
 *                       description: 包管理配置信息
 *             example:
 *               success: true
 *               config:
 *                 packages:
 *                   frontend:
 *                     uploadDir: "uploads/packages/frontend"
 *                     maxFileSize: "100MB"
 *                     allowedExtensions: [".zip", ".tar.gz", ".tar"]
 *                   backend:
 *                     uploadDir: "uploads/packages/backend"
 *                     maxFileSize: "100MB"
 *                     allowedExtensions: [".zip", ".tar.gz", ".tar"]
 *                 settings:
 *                   autoCleanup: true
 *                   maxPackageCount: 20
 *                   storageQuota: "1GB"
 *                 lastUpdated: "2025-09-11T10:00:00.000Z"
 *       500:
 *         description: 服务器内部错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *             example:
 *               success: false
 *               error: "获取配置失败"
 */
router.get('/config', getPackageConfig);

export default router;
