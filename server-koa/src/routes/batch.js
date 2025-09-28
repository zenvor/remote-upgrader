// 批量操作路由配置
import Router from '@koa/router'
import {
  createBatchUpgrade,
  createBatchRollback,
  getBatchTasks,
  getBatchTask,
  cancelBatchTask,
  retryFailedDevices,
  getBatchTaskStats
} from '../controllers/batchController.js'

const router = new Router({
  prefix: '/api/batch'
})

/**
 * @swagger
 * components:
 *   schemas:
 *     BatchTask:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: 任务ID
 *         type:
 *           type: string
 *           enum: [upgrade, rollback]
 *           description: 任务类型
 *         status:
 *           type: string
 *           enum: [pending, running, completed, failed, cancelled]
 *           description: 任务状态
 *         creator:
 *           type: string
 *           description: 创建者
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: 创建时间
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: 更新时间
 *         config:
 *           type: object
 *           description: 任务配置
 *         stats:
 *           type: object
 *           properties:
 *             total:
 *               type: integer
 *               description: 总设备数
 *             waiting:
 *               type: integer
 *               description: 等待中设备数
 *             upgrading:
 *               type: integer
 *               description: 升级中设备数
 *             success:
 *               type: integer
 *               description: 成功设备数
 *             failed:
 *               type: integer
 *               description: 失败设备数
 *             timeout:
 *               type: integer
 *               description: 超时设备数
 *
 *     BatchTaskDetail:
 *       allOf:
 *         - $ref: '#/components/schemas/BatchTask'
 *         - type: object
 *           properties:
 *             devices:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   deviceId:
 *                     type: string
 *                   status:
 *                     type: string
 *                     enum: [waiting, upgrading, success, failed, timeout]
 *                   startTime:
 *                     type: string
 *                     format: date-time
 *                   endTime:
 *                     type: string
 *                     format: date-time
 *                   error:
 *                     type: string
 *                   retryCount:
 *                     type: integer
 *             logs:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   timestamp:
 *                     type: string
 *                     format: date-time
 *                   level:
 *                     type: string
 *                   message:
 *                     type: string
 *                   details:
 *                     type: object
 */

/**
 * @swagger
 * /api/batch/upgrade:
 *   post:
 *     summary: 创建批量升级任务
 *     tags: [批量操作]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - deviceIds
 *               - packageFileName
 *               - project
 *             properties:
 *               deviceIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 目标设备ID列表
 *                 example: ["device001", "device002", "device003"]
 *               packageFileName:
 *                 type: string
 *                 description: 升级包文件名
 *                 example: "app-v1.2.0.zip"
 *               project:
 *                 type: string
 *                 enum: [frontend, backend]
 *                 description: 项目类型
 *                 example: "frontend"
 *               deployPath:
 *                 type: string
 *                 description: 自定义部署路径，留空则使用设备默认配置
 *                 example: "/opt/apps/frontend"
 *               preservedPaths:
 *                 type: array
 *                 description: 需要保护的文件或目录，升级时不会被删除
 *                 items:
 *                   type: string
 *                 example: [".env", "config/", "logs/"]
 *     responses:
 *       200:
 *         description: 任务创建成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 taskId:
 *                   type: string
 *                   example: "batch_1703123456789_abc123"
 *                 message:
 *                   type: string
 *                   example: "批量升级任务已创建"
 *                 stats:
 *                   type: object
 *                   properties:
 *                     totalDevices:
 *                       type: integer
 *                       example: 5
 *                     validDevices:
 *                       type: integer
 *                       example: 3
 *                     invalidDevices:
 *                       type: integer
 *                       example: 2
 *       400:
 *         description: 请求参数错误
 *       404:
 *         description: 升级包不存在
 *       500:
 *         description: 服务器内部错误
 */
router.post('/upgrade', createBatchUpgrade)

/**
 * @swagger
 * /api/batch/rollback:
 *   post:
 *     summary: 创建批量回滚任务
 *     tags: [批量操作]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - deviceIds
 *               - project
 *             properties:
 *               deviceIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 目标设备ID列表，系统会自动读取并应用每台设备的白名单配置
 *                 example: ["device001", "device002", "device003"]
 *               project:
 *                 type: string
 *                 enum: [frontend, backend]
 *                 description: 项目类型
 *                 example: "frontend"
 *     responses:
 *       200:
 *         description: 任务创建成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 taskId:
 *                   type: string
 *                   example: "batch_1703123456789_def456"
 *                 message:
 *                   type: string
 *                   example: "批量回滚任务已创建"
 *                 stats:
 *                   type: object
 *                   properties:
 *                     totalDevices:
 *                       type: integer
 *                       example: 5
 *                     validDevices:
 *                       type: integer
 *                       example: 3
 *                     invalidDevices:
 *                       type: integer
 *                       example: 2
 *       400:
 *         description: 请求参数错误或设备缺少白名单配置
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
 *                   example: "以下设备缺少白名单配置，已阻止回滚：device001, device004"
 *       500:
 *         description: 服务器内部错误
 */
router.post('/rollback', createBatchRollback)

/**
 * @swagger
 * /api/batch/tasks:
 *   get:
 *     summary: 获取批量任务列表
 *     tags: [批量操作]
 *     parameters:
 *       - name: status
 *         in: query
 *         description: 任务状态筛选
 *         schema:
 *           type: string
 *           enum: [pending, running, completed, failed, cancelled]
 *       - name: type
 *         in: query
 *         description: 任务类型筛选
 *         schema:
 *           type: string
 *           enum: [upgrade, rollback]
 *       - name: pageNum
 *         in: query
 *         description: 页码
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - name: pageSize
 *         in: query
 *         description: 每页数量
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: 获取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 tasks:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/BatchTask'
 *                 total:
 *                   type: integer
 *                   example: 50
 *                 pageNum:
 *                   type: integer
 *                   example: 1
 *                 pageSize:
 *                   type: integer
 *                   example: 20
 *                 totalPages:
 *                   type: integer
 *                   example: 3
 *       400:
 *         description: 请求参数错误
 *       500:
 *         description: 服务器内部错误
 */
router.get('/tasks', getBatchTasks)

/**
 * @swagger
 * /api/batch/tasks/{taskId}:
 *   get:
 *     summary: 获取单个批量任务详情
 *     tags: [批量操作]
 *     parameters:
 *       - name: taskId
 *         in: path
 *         required: true
 *         description: 任务ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 获取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 task:
 *                   $ref: '#/components/schemas/BatchTaskDetail'
 *       404:
 *         description: 任务不存在
 *       500:
 *         description: 服务器内部错误
 */
router.get('/tasks/:taskId', getBatchTask)

/**
 * @swagger
 * /api/batch/tasks/{taskId}:
 *   delete:
 *     summary: 取消批量任务
 *     tags: [批量操作]
 *     parameters:
 *       - name: taskId
 *         in: path
 *         required: true
 *         description: 任务ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 取消成功
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
 *                   example: "任务已取消"
 *       400:
 *         description: 任务状态不允许取消
 *       404:
 *         description: 任务不存在
 *       500:
 *         description: 服务器内部错误
 */
router.delete('/tasks/:taskId', cancelBatchTask)

/**
 * @swagger
 * /api/batch/tasks/{taskId}/retry:
 *   post:
 *     summary: 重试失败的设备
 *     tags: [批量操作]
 *     parameters:
 *       - name: taskId
 *         in: path
 *         required: true
 *         description: 任务ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 重试启动成功
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
 *                   example: "失败设备重试已启动"
 *       400:
 *         description: 没有可重试的设备
 *       404:
 *         description: 任务不存在
 *       500:
 *         description: 服务器内部错误
 */
router.post('/tasks/:taskId/retry', retryFailedDevices)

/**
 * @swagger
 * /api/batch/stats:
 *   get:
 *     summary: 获取批量任务系统统计信息
 *     tags: [批量操作]
 *     responses:
 *       200:
 *         description: 获取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 stats:
 *                   type: object
 *                   properties:
 *                     totalTasks:
 *                       type: integer
 *                       description: 总任务数
 *                       example: 50
 *                     pendingTasks:
 *                       type: integer
 *                       description: 待执行任务数
 *                       example: 5
 *                     runningTasks:
 *                       type: integer
 *                       description: 执行中任务数
 *                       example: 2
 *                     completedTasks:
 *                       type: integer
 *                       description: 已完成任务数
 *                       example: 40
 *                     failedTasks:
 *                       type: integer
 *                       description: 失败任务数
 *                       example: 3
 *                     cancelledTasks:
 *                       type: integer
 *                       description: 已取消任务数
 *                       example: 0
 *                     upgradeTasksCount:
 *                       type: integer
 *                       description: 升级任务数
 *                       example: 35
 *                     rollbackTasksCount:
 *                       type: integer
 *                       description: 回滚任务数
 *                       example: 15
 *                     totalDevicesProcessed:
 *                       type: integer
 *                       description: 处理的设备总数
 *                       example: 150
 *                     totalSuccessDevices:
 *                       type: integer
 *                       description: 成功设备总数
 *                       example: 140
 *                     totalFailedDevices:
 *                       type: integer
 *                       description: 失败设备总数
 *                       example: 10
 *       500:
 *         description: 服务器内部错误
 */
router.get('/stats', getBatchTaskStats)

export default router
