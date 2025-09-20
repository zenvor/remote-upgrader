// 中文注释：ESM 导入
import Router from '@koa/router';
import { getDevices, sendCommand } from '../controllers/deviceController.js';

const router = new Router({
  prefix: '/devices'
});

/**
 * @swagger
 * /devices:
 *   get:
 *     tags: [Devices]
 *     summary: 获取设备列表
 *     description: 获取设备列表，支持状态筛选、搜索和分页
 *     parameters:
 *       - name: status
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           enum: [all, online, offline, upgrading, error]
 *           default: all
 *         description: 设备状态筛选
 *         example: "online"
 *       - name: search
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *         description: 搜索关键词（设备名称或设备ID）
 *         example: "生产服务器"
 *       - name: pageNum
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: 页码
 *       - name: pageSize
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: 每页数量
 *     responses:
 *       200:
 *         description: 设备列表获取成功
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     devices:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           deviceId:
 *                             type: string
 *                             description: 设备ID
 *                           deviceName:
 *                             type: string
 *                             description: 设备名称
 *                           version:
 *                             type: string
 *                             description: 设备版本
 *                           system:
 *                             type: object
 *                             description: 系统信息
 *                             properties:
 *                               platform:
 *                                 type: string
 *                                 description: 设备平台
 *                               osVersion:
 *                                 type: string
 *                                 nullable: true
 *                                 description: 操作系统版本
 *                               arch:
 *                                 type: string
 *                                 nullable: true
 *                                 description: 系统架构
 *                           network:
 *                             type: object
 *                             description: 网络信息分组
 *                             properties:
 *                               wifiName:
 *                                 type: string
 *                                 nullable: true
 *                                 description: WiFi名称
 *                               wifiSignal:
 *                                 type: number
 *                                 nullable: true
 *                                 description: WiFi信号强度
 *                               publicIp:
 *                                 type: string
 *                                 nullable: true
 *                                 description: 公网IP
 *                               localIp:
 *                                 type: string
 *                                 nullable: true
 *                                 description: 本地IP
 *                               macAddresses:
 *                                 type: array
 *                                 items: { type: string }
 *                                 nullable: true
 *                                 description: MAC 地址列表
 *                           agent:
 *                             type: object
 *                             description: 代理信息
 *                             properties:
 *                               agentVersion:
 *                                 type: string
 *                                 nullable: true
 *                                 description: 设备代理版本
 *                           storage:
 *                             type: object
 *                             description: 存储与权限
 *                             properties:
 *                               diskFreeBytes:
 *                                 type: integer
 *                                 nullable: true
 *                                 description: 可用空间（字节）
 *                               writable:
 *                                 type: boolean
 *                                 nullable: true
 *                                 description: 部署目录可写
 *                           health:
 *                             type: object
 *                             description: 运行健康
 *                             properties:
 *                               uptimeSeconds:
 *                                 type: integer
 *                                 nullable: true
 *                                 description: 运行时长（秒）
 
 *                           status:
 *                             type: string
 *                             enum: [online, offline, upgrading, error]
 *                             description: 设备状态
 *                           connectedAt:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                             description: 连接时间
 *                           disconnectedAt:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                             description: 断开连接时间
 *                           lastHeartbeat:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                             description: 最后心跳时间
 *                           deploy:
 *                             type: object
 *                             description: 部署信息（新配置结构）
 *                             properties:
 *                               capabilities:
 *                                 type: object
 *                                 description: 设备部署能力
 *                                 properties:
 *                                   rollbackAvailable:
 *                                     type: boolean
 *                                     description: 是否支持回滚
 *                                   supportedProjects:
 *                                     type: array
 *                                     items:
 *                                       type: string
 *                                       enum: [frontend, backend]
 *                                     description: 支持的项目类型
 *                               currentDeployments:
 *                                 type: object
 *                                 description: 当前部署状态
 *                                 properties:
 *                                   frontend:
 *                                     type: object
 *                                     properties:
 *                                       version:
 *                                         type: string
 *                                         description: 版本号
 *                                       deployDate:
 *                                         type: string
 *                                         format: date-time
 *                                         nullable: true
 *                                         description: 部署时间
 *                                       deployPath:
 *                                         type: string
 *                                         nullable: true
 *                                         description: 部署路径
 *                                       packageInfo:
 *                                         type: object
 *                                         nullable: true
 *                                         description: 包信息
 *                                       status:
 *                                         type: string
 *                                         description: 部署状态
 *                                       lastOperationType:
 *                                         type: string
 *                                         nullable: true
 *                                         description: 最近操作类型
 *                                       lastOperationDate:
 *                                         type: string
 *                                         format: date-time
 *                                         nullable: true
 *                                         description: 最近操作时间
 *                                   backend:
 *                                     type: object
 *                                     properties:
 *                                       version:
 *                                         type: string
 *                                         description: 版本号
 *                                       deployDate:
 *                                         type: string
 *                                         format: date-time
 *                                         nullable: true
 *                                         description: 部署时间
 *                                       deployPath:
 *                                         type: string
 *                                         nullable: true
 *                                         description: 部署路径
 *                                       packageInfo:
 *                                         type: object
 *                                         nullable: true
 *                                         description: 包信息
 *                                       status:
 *                                         type: string
 *                                         description: 部署状态
 *                                       lastOperationType:
 *                                         type: string
 *                                         nullable: true
 *                                         description: 最近操作类型
 *                                       lastOperationDate:
 *                                         type: string
 *                                         format: date-time
 *                                         nullable: true
 *                                         description: 最近操作时间
 *                               previousDeployments:
 *                                 type: object
 *                                 description: 上一版本部署信息（用于回滚）
 *                                 properties:
 *                                   frontend:
 *                                     type: object
 *                                     properties:
 *                                       version:
 *                                         type: string
 *                                         nullable: true
 *                                       deployPath:
 *                                         type: string
 *                                         nullable: true
 *                                       packageInfo:
 *                                         type: object
 *                                         nullable: true
 *                                       rollbackDate:
 *                                         type: string
 *                                         format: date-time
 *                                         nullable: true
 *                                   backend:
 *                                     type: object
 *                                     properties:
 *                                       version:
 *                                         type: string
 *                                         nullable: true
 *                                       deployPath:
 *                                         type: string
 *                                         nullable: true
 *                                       packageInfo:
 *                                         type: object
 *                                         nullable: true
 *                                       rollbackDate:
 *                                         type: string
 *                                         format: date-time
 *                                         nullable: true
 *                               deploymentHistory:
 *                                 type: array
 *                                 description: 部署历史记录
 *                                 items:
 *                                   type: object
 *                               lastDeployStatus:
 *                                 type: string
 *                                 nullable: true
 *                                 description: 最近部署状态
 *                               lastDeployAt:
 *                                 type: string
 *                                 format: date-time
 *                                 nullable: true
 *                                 description: 最近部署时间
 *                               lastRollbackAt:
 *                                 type: string
 *                                 format: date-time
 *                                 nullable: true
 *                                 description: 最近回滚时间
 *                           # 提示：deployPaths 字段已移除，请从 deploy.currentDeployments 中获取 deployPath
 *                           hasDeployPath:
 *                             type: boolean
 *                             description: 是否配置了部署路径
 *                       description: 设备信息列表
 *                     total:
 *                       type: integer
 *                       description: 设备总数
 *                     onlineCount:
 *                       type: integer
 *                       description: 在线设备数量
 *                     pageNum:
 *                       type: integer
 *                       description: 当前页码
 *                     pageSize:
 *                       type: integer
 *                       description: 每页数量
 *                     totalPages:
 *                       type: integer
 *                       description: 总页数
 *                     filters:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           description: 状态筛选
 *                         search:
 *                           type: string
 *                           description: 搜索关键词
 *             example:
 *               success: true
 *               devices:
 *                 - deviceId: "device-001"
 *                   deviceName: "生产服务器-1"
 *                   version: "v1.0.0"
 *                   system:
 *                     platform: "linux"
 *                     osVersion: "5.15"
 *                     arch: "x64"
 *                   network:
 *                     wifiName: "Office-WiFi"
 *                     wifiSignal: -45
 *                     publicIp: "203.0.113.1"
 *                   status: "online"
 *                   connectedAt: "2025-09-09T03:30:00.000Z"
 *                   disconnectedAt: null
 *                   lastHeartbeat: "2025-09-09T03:35:00.000Z"
 *                   deploy:
 *                     capabilities:
 *                       rollbackAvailable: true
 *                       supportedProjects: ["frontend", "backend"]
 *                     currentDeployments:
 *                       frontend:
 *                         version: "v1.0.0"
 *                         deployDate: "2025-09-09T03:35:00.000Z"
 *                         deployPath: "/opt/frontend"
 *                         packageInfo: null
 *                         status: "deployed"
 *                         lastOperationType: "upgrade"
 *                         lastOperationDate: "2025-09-09T03:35:00.000Z"
 *                       backend:
 *                         version: "v1.0.1"
 *                         deployDate: "2025-09-09T03:30:00.000Z"
 *                         deployPath: "/opt/backend"
 *                         packageInfo: null
 *                         status: "deployed"
 *                         lastOperationType: "upgrade"
 *                         lastOperationDate: "2025-09-09T03:30:00.000Z"
 *                     previousDeployments:
 *                       frontend:
 *                         version: "v0.9.5"
 *                         deployPath: "/opt/frontend"
 *                         packageInfo: null
 *                         rollbackDate: null
 *                       backend:
 *                         version: "v0.9.8"
 *                         deployPath: "/opt/backend"
 *                         packageInfo: null
 *                         rollbackDate: null
 *                     deploymentHistory: []
 *                     lastDeployStatus: "success"
 *                     lastDeployAt: "2025-09-09T03:35:00.000Z"
 *                     lastRollbackAt: null
 *                   # 提示：deployPaths 字段已移除
 *                 - deviceId: "device-002"
 *                   deviceName: "生产服务器-2"
 *                   version: "v0.9.0"
 *                   system:
 *                     platform: "linux"
 *                   network:
 *                     wifiName: null
 *                     wifiSignal: null
 *                     publicIp: null
 *                   status: "offline"
 *                   connectedAt: "2025-09-09T02:30:00.000Z"
 *                   disconnectedAt: "2025-09-09T02:50:00.000Z"
 *                   lastHeartbeat: "2025-09-09T02:45:00.000Z"
 *                   deploy:
 *                     capabilities:
 *                       rollbackAvailable: false
 *                       supportedProjects: ["frontend", "backend"]
 *                     currentDeployments:
 *                       frontend:
 *                         version: "unknown"
 *                         deployDate: null
 *                         deployPath: null
 *                         packageInfo: null
 *                         status: "unknown"
 *                         lastOperationType: null
 *                         lastOperationDate: null
 *                       backend:
 *                         version: "unknown"
 *                         deployDate: null
 *                         deployPath: null
 *                         packageInfo: null
 *                         status: "unknown"
 *                         lastOperationType: null
 *                         lastOperationDate: null
 *                     previousDeployments:
 *                       frontend:
 *                         version: null
 *                         deployPath: null
 *                         packageInfo: null
 *                         rollbackDate: null
 *                       backend:
 *                         version: null
 *                         deployPath: null
 *                         packageInfo: null
 *                         rollbackDate: null
 *                     deploymentHistory: []
 *                     lastDeployStatus: null
 *                     lastDeployAt: null
 *                     lastRollbackAt: null
 *                   # 提示：deployPaths 字段已移除
 *               total: 2
 *               onlineCount: 1
 *               pageNum: 1
 *               pageSize: 20
 *               totalPages: 1
 *               filters:
 *                 status: "all"
 *                 search: ""
 *       500:
 *         description: 服务器内部错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *             example:
 *               success: false
 *               error: "获取设备列表失败"
 */
router.get('/', getDevices);


/**
 * @swagger
 * /devices/{deviceId}/command:
 *   post:
 *     tags: [Devices]
 *     summary: 向设备发送命令
 *     description: 通过 Socket.IO 向指定设备发送控制命令，如升级、降级等操作
 *     parameters:
 *       - $ref: '#/components/parameters/DeviceIdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SendCommandRequest'
 *           examples:
 *             upgrade:
 *               summary: 升级命令
 *               value:
 *                 command: "cmd:upgrade"
 *                 data:
 *                   project: "frontend"
 *                   fileName: "frontend-v1.0.0.zip"
 *                   version: "v1.0.0"
 *                   deployPath: "/opt/frontend"
 *                   fileMD5: "abc123def456789"
 *             rollback:
 *               summary: 降级命令
 *               value:
 *                 command: "cmd:rollback"
 *                 data:
 *                   project: "frontend"
 *             heartbeat:
 *               summary: 心跳检测
 *               value:
 *                 command: "device:heartbeat"
 *                 data: {}
 *             status:
 *               summary: 查询设备状态
 *               value:
 *                 command: "cmd:status"
 *                 data: {}
 *             getCurrentVersion:
 *               summary: 获取当前版本
 *               value:
 *                 command: "getCurrentVersion"
 *                 data:
 *                   project: "frontend"
 *             refreshNetwork:
 *               summary: 立即刷新网络信息
 *               value:
 *                 command: "config:refresh-network"
 *                 data: {}
 *     responses:
 *       200:
 *         description: 命令发送成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *             example:
 *               success: true
 *               message: "命令发送成功"
 *       400:
 *         description: 请求参数错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *             example:
 *               success: false
 *               error: "缺少 command 参数"
 *       404:
 *         description: 设备不在线或不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *             example:
 *               success: false
 *               error: "设备不在线或不存在"
 *       500:
 *         description: 服务器内部错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *             example:
 *               success: false
 *               error: "发送命令失败"
 */
router.post('/:deviceId/command', sendCommand);



export default router;
