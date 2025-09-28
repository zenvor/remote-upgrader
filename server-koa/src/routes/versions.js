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
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/VersionInfo'
 *                 message:
 *                   type: string
 *                   description: 操作结果消息
 *                   example: "获取当前版本成功"
 *             examples:
 *               frontend:
 *                 summary: 获取前端版本信息
 *                 value:
 *                   success: true
 *                   message: "获取当前版本成功"
 *                   data:
 *                     version: "v1.0.0"
 *                     deployDate: "2025-09-21T10:00:00.000Z"
 *                     deployPath: "/opt/frontend"
 *                     project: "frontend"
 *                     packageInfo:
 *                       fileName: "frontend-v1.0.0.zip"
 *                       fileMD5: "abc123def456789"
 *               backend:
 *                 summary: 获取后端版本信息
 *                 value:
 *                   success: true
 *                   message: "获取当前版本成功"
 *                   data:
 *                     version: "v1.0.1"
 *                     deployDate: "2025-09-21T09:30:00.000Z"
 *                     deployPath: "/opt/backend"
 *                     project: "backend"
 *                     packageInfo:
 *                       fileName: "backend-v1.0.1.zip"
 *                       fileMD5: "def456ghi789012"
 *       400:
 *         description: 参数错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   description: 错误信息
 *             examples:
 *               invalidProject:
 *                 summary: 项目类型无效
 *                 value:
 *                   success: false
 *                   message: "项目类型参数无效，必须是 frontend 或 backend"
 *               missingProject:
 *                 summary: 缺少项目类型
 *                 value:
 *                   success: false
 *                   message: "缺少必要的 project 参数"
 *       404:
 *         description: 设备不在线或版本信息不存在
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   description: 错误信息
 *             examples:
 *               deviceOffline:
 *                 summary: 设备不在线
 *                 value:
 *                   success: false
 *                   message: "设备不在线，无法获取版本信息"
 *               noVersion:
 *                 summary: 版本信息不存在
 *                 value:
 *                   success: false
 *                   message: "该项目尚未部署或版本信息不存在"
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
 *                 message:
 *                   type: string
 *                   description: 错误信息
 *                 error:
 *                   type: string
 *                   description: 详细错误信息（仅开发环境）
 *             example:
 *               success: false
 *               message: "服务器内部错误"
 *               error: "Device communication timeout"
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   description: 回滚成功消息
 *                   example: "回滚到上一版本成功"
 *                 data:
 *                   type: object
 *                   nullable: true
 *                   description: 回滚操作的详细信息
 *                   properties:
 *                     rollbackVersion:
 *                       type: string
 *                       description: 回滚到的版本号
 *                     rollbackDate:
 *                       type: string
 *                       format: date-time
 *                       description: 回滚时间
 *             example:
 *               success: true
 *               message: "回滚到上一版本成功"
 *               data:
 *                 rollbackVersion: "v0.9.5"
 *                 rollbackDate: "2025-09-21T10:30:00.000Z"
 *       400:
 *         description: 参数错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   description: 错误信息
 *             examples:
 *               invalidProject:
 *                 summary: 项目类型无效
 *                 value:
 *                   success: false
 *                   message: "项目类型参数无效，必须是 frontend 或 backend"
 *               missingProject:
 *                 summary: 缺少项目类型
 *                 value:
 *                   success: false
 *                   message: "缺少必要的 project 参数"
 *       404:
 *         description: 设备不在线或回滚失败
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   description: 错误信息
 *             examples:
 *               deviceOffline:
 *                 summary: 设备不在线
 *                 value:
 *                   success: false
 *                   message: "设备不在线，无法执行回滚操作"
 *               noBackupVersion:
 *                 summary: 没有可回滚的版本
 *                 value:
 *                   success: false
 *                   message: "没有可回滚的版本"
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
 *                 message:
 *                   type: string
 *                   description: 错误信息
 *                 error:
 *                   type: string
 *                   description: 详细错误信息（仅开发环境）
 *             example:
 *               success: false
 *               message: "服务器内部错误"
 *               error: "Connection timeout"
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

    // 使用批量管理器进行回滚（确保白名单保护）
    const { getDevicePreservedPaths, initializeBatchTaskManager } = await import('../controllers/deviceController.js')

    // 获取白名单配置
    let preservedPaths = []
    try {
      preservedPaths = await getDevicePreservedPaths(deviceId, project)
    } catch (error) {
      console.warn(`获取设备 ${deviceId} 白名单配置失败:`, error.message)
    }

    // 通过批量管理器创建并执行回滚任务
    const batchTaskManager = await initializeBatchTaskManager()
    const taskId = await batchTaskManager.createRollbackTask({
      deviceIds: [deviceId],
      project,
      preservedPaths,
      sessionId: `quick_rollback_${Date.now()}`,
      creator: 'versions_api',
      scope: 'single'
    })

    // 异步执行任务
    batchTaskManager.executeTask(taskId).catch(error => {
      console.error(`快速回滚任务执行失败: ${taskId}`, error.message)
    })

    ctx.body = {
      success: true,
      message: '回滚命令已发送',
      data: {
        taskId,
        project,
        preservedPathsCount: preservedPaths.length
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
