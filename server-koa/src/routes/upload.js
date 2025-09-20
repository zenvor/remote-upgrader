// 中文注释：ESM 导入
import Router from '@koa/router';
import { directUpload } from '../controllers/uploadController.js';
import upload from '../middleware/upload.js';

const router = new Router({
  prefix: '/upload'
});

/**
 * @swagger
 * /upload/direct:
 *   post:
 *     tags: [Upload]
 *     summary: 直接上传文件
 *     description: 一次性上传完整文件，支持 MD5 校验和秒传功能。如果相同文件已存在（相同大小和MD5），将自动返回秒传成功结果。
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: 要上传的文件
 *               project:
 *                 type: string
 *                 enum: [frontend, backend]
 *                 description: 项目类型
 *                 example: "frontend"
 *               version:
 *                 type: string
 *                 description: 可选，应用版本号（如 v1.2.3 或 1.2.3）
 *                 example: "v1.2.3"
 *             required: [file, project]
 *     responses:
 *       200:
 *         description: 上传成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 done:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   description: "上传完成消息，秒传时会显示文件已存在信息"
 *                   example: "文件上传完成"
 *                 fileMD5:
 *                   type: string
 *                   example: "a1b2c3d4e5f6789012345678901234567890abcd"
 *                 fileName:
 *                   type: string
 *                   example: "frontend-v1.0.0.zip"
 *                 version:
 *                   type: string
 *                   description: 记录的包版本（回显）
 *                   example: "v1.0.0"
 *                 fileSize:
 *                   type: integer
 *                   example: 10485760
 *                 packagePath:
 *                   type: string
 *                   example: "packages/frontend/frontend-v1.0.0.zip"
 *       400:
 *         description: 请求参数错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "缺少必要参数: project, file"
 *       500:
 *         description: 服务器内部错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "上传失败: 文件处理错误"
 */
router.post('/direct', upload.single('file'), directUpload);

export default router;
