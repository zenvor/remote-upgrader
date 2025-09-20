// 版本管理路由
import Router from '@koa/router'
import deviceManager from '../models/deviceManager.js'

const router = new Router({
  prefix: '/api'
})

// 测试端点 - 验证路由是否工作
router.get('/versions/test', async (ctx) => {
  ctx.body = {
    success: true,
    message: '版本管理路由工作正常',
    timestamp: new Date().toISOString()
  }
})

/**
 * @swagger
 * components:
 *   schemas:
 *     VersionInfo:
 *       type: object
 *       properties:
 *         version:
 *           type: string
 *           description: 版本号
 *         deployDate:
 *           type: string
 *           format: date-time
 *           description: 部署时间
 *         deployPath:
 *           type: string
 *           nullable: true
 *           description: 部署路径
 *         project:
 *           type: string
 *           enum: [frontend, backend]
 *           description: 所属项目
 *         packageInfo:
 *           type: object
 *           nullable: true
 *           description: 附加包信息（可选）
 */

/**
 * @swagger
 * /api/versions/{deviceId}/current:
 *   get:
 *     summary: 获取设备当前版本信息
 *     tags: [版本管理]
 *     parameters:
 *       - in: path
 *         name: deviceId
 *         required: true
 *         schema:
 *           type: string
 *         description: 设备ID
 *       - in: query
 *         name: project
 *         required: true
 *         schema:
 *           type: string
 *           enum: [frontend, backend]
 *         description: 项目类型
 *     responses:
 *       200:
 *         description: 成功获取当前版本信息
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/VersionInfo'
 */
router.get('/versions/:deviceId/current', async (ctx) => {
  try {
    const { deviceId } = ctx.params
    const { project } = ctx.query

    if (!project || !['frontend', 'backend'].includes(project)) {
      ctx.status = 400
      ctx.body = {
        success: false,
        message: '项目类型参数无效，必须是 frontend 或 backend'
      }
      return
    }

    // 使用导入的 deviceManager

    // 发送获取当前版本的命令到设备
    const result = await deviceManager.sendCommand(deviceId, 'getCurrentVersion', {
      project
    })

    const response = result.data

    if (result.success && response?.success) {
      const body = {
        success: true,
        data: response.data || null,
        message: response.message || '获取当前版本成功'
      }

      ctx.body = body
    } else {
      ctx.status = 500
      ctx.body = {
        success: false,
        message: response?.message || result.error || '获取当前版本失败'
      }
    }
  } catch (error) {
    console.error('获取当前版本失败:', error, { deviceId: ctx.params.deviceId })
    ctx.status = 500
    ctx.body = {
      success: false,
      message: '服务器内部错误',
      error: error.message
    }
  }
})

/**
 * @swagger
 * /api/versions/{deviceId}/rollback:
 *   post:
 *     summary: 回滚到上一版本
 *     tags: [版本管理]
 *     parameters:
 *       - in: path
 *         name: deviceId
 *         required: true
 *         schema:
 *           type: string
 *         description: 设备ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - project
 *             properties:
 *               project:
 *                 type: string
 *                 enum: [frontend, backend]
 *                 description: 项目类型
 *     responses:
 *       200:
 *         description: 回滚成功
 *       400:
 *         description: 参数错误
 *       500:
 *         description: 回滚失败
 */
router.post('/versions/:deviceId/rollback', async (ctx) => {
  try {
    const { deviceId } = ctx.params
    const { project } = ctx.request.body

    if (!project || !['frontend', 'backend'].includes(project)) {
      ctx.status = 400
      ctx.body = {
        success: false,
        message: '项目类型参数无效，必须是 frontend 或 backend'
      }
      return
    }

    // 发送简单回滚命令到设备（回滚到上一版本）
    const result = await deviceManager.sendCommand(deviceId, 'cmd:rollback', {
      project
    })

    const response = result.data

    if (result.success && response?.success) {
      ctx.body = {
        success: true,
        message: response.message || '回滚到上一版本成功',
        data: response.data || null
      }
    } else {
      ctx.status = 500
      ctx.body = {
        success: false,
        message: response?.message || result.error || '回滚失败'
      }
    }
  } catch (error) {
    console.error('版本回滚失败:', error, { deviceId: ctx.params.deviceId })
    ctx.status = 500
    ctx.body = {
      success: false,
      message: '服务器内部错误',
      error: error.message
    }
  }
})

export default router
