// 中文注释：ESM 导入
import Router from '@koa/router'
import { getDevices, sendCommand } from '../controllers/deviceController.js'

const router = new Router({
  prefix: '/devices'
})

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
 *                           status:
 *                             type: string
 *                             enum: [online, offline, upgrading, error]
 *                             description: 设备状态
 *                           # 系统信息（扁平化结构）
 *                           platform:
 *                             type: string
 *                             nullable: true
 *                             description: 设备平台
 *                           osVersion:
 *                             type: string
 *                             nullable: true
 *                             description: 操作系统版本
 *                           arch:
 *                             type: string
 *                             nullable: true
 *                             description: 系统架构
 *                           agentVersion:
 *                             type: string
 *                             nullable: true
 *                             description: 设备代理版本
 *                           # 网络信息（扁平化结构）
 *                           wifiName:
 *                             type: string
 *                             nullable: true
 *                             description: WiFi名称
 *                           wifiSignal:
 *                             type: number
 *                             nullable: true
 *                             description: WiFi信号强度
 *                           publicIp:
 *                             type: string
 *                             nullable: true
 *                             description: 公网IP
 *                           localIp:
 *                             type: string
 *                             nullable: true
 *                             description: 本地IP
 *                           macAddresses:
 *                             type: array
 *                             items: { type: string }
 *                             description: MAC 地址列表
 *                           # 版本信息（扁平化结构）
 *                           frontendVersion:
 *                             type: string
 *                             nullable: true
 *                             description: 前端版本号
 *                           backendVersion:
 *                             type: string
 *                             nullable: true
 *                             description: 后端版本号
 *                           frontendDeployPath:
 *                             type: string
 *                             nullable: true
 *                             description: 前端部署路径
 *                           backendDeployPath:
 *                             type: string
 *                             nullable: true
 *                             description: 后端部署路径
 *                           # 存储信息（扁平化结构）
 *                           diskFreeBytes:
 *                             type: integer
 *                             nullable: true
 *                             description: 可用空间（字节）
 *                           writable:
 *                             type: boolean
 *                             nullable: true
 *                             description: 部署目录可写
 *                           # 健康状态（扁平化结构）
 *                           uptimeSeconds:
 *                             type: integer
 *                             nullable: true
 *                             description: 运行时长（秒）
 
 *                           # 连接状态
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
 *                           # 部署能力标识
 *                           hasDeployPath:
 *                             type: boolean
 *                             description: 是否配置了部署路径
 *                           rollbackAvailable:
 *                             type: boolean
 *                             description: 是否支持回滚
 *                           # 部署详情（用于详情页面显示）
 *                           deployInfo:
 *                             type: object
 *                             description: 部署详细信息
 *                             properties:
 *                               rollbackAvailable:
 *                                 type: boolean
 *                                 description: 是否支持回滚
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
 *                               frontend:
 *                                 type: object
 *                                 properties:
 *                                   version:
 *                                     type: string
 *                                     nullable: true
 *                                     description: 前端版本号
 *                                   deployDate:
 *                                     type: string
 *                                     format: date-time
 *                                     nullable: true
 *                                     description: 前端部署时间
 *                                   deployPath:
 *                                     type: string
 *                                     nullable: true
 *                                     description: 前端部署路径
 *                               backend:
 *                                 type: object
 *                                 properties:
 *                                   version:
 *                                     type: string
 *                                     nullable: true
 *                                     description: 后端版本号
 *                                   deployDate:
 *                                     type: string
 *                                     format: date-time
 *                                     nullable: true
 *                                     description: 后端部署时间
 *                                   deployPath:
 *                                     type: string
 *                                     nullable: true
 *                                     description: 后端部署路径
 *                           # 升级历史
 *                           upgradeHistory:
 *                             type: array
 *                             description: 升级历史记录
 *                             items:
 *                               type: object
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
 *                   status: "online"
 *                   # 系统信息（扁平化）
 *                   platform: "linux"
 *                   osVersion: "5.15"
 *                   arch: "x64"
 *                   agentVersion: "v1.2.0"
 *                   # 网络信息（扁平化）
 *                   wifiName: "Office-WiFi"
 *                   wifiSignal: -45
 *                   publicIp: "203.0.113.1"
 *                   localIp: "192.168.1.100"
 *                   macAddresses: ["aa:bb:cc:dd:ee:ff"]
 *                   # 版本信息（扁平化）
 *                   frontendVersion: "v1.0.0"
 *                   backendVersion: "v1.0.1"
 *                   frontendDeployPath: "/opt/frontend"
 *                   backendDeployPath: "/opt/backend"
 *                   # 存储信息（扁平化）
 *                   diskFreeBytes: 10737418240
 *                   writable: true
 *                   # 健康状态（扁平化）
 *                   uptimeSeconds: 86400
 *                   # 连接状态
 *                   connectedAt: "2025-09-09T03:30:00.000Z"
 *                   disconnectedAt: null
 *                   lastHeartbeat: "2025-09-09T03:35:00.000Z"
 *                   # 部署能力标识
 *                   hasDeployPath: true
 *                   rollbackAvailable: true
 *                   # 部署详情
 *                   deployInfo:
 *                     rollbackAvailable: true
 *                     lastDeployStatus: "success"
 *                     lastDeployAt: "2025-09-09T03:35:00.000Z"
 *                     lastRollbackAt: null
 *                     frontend:
 *                       version: "v1.0.0"
 *                       deployDate: "2025-09-09T03:35:00.000Z"
 *                       deployPath: "/opt/frontend"
 *                     backend:
 *                       version: "v1.0.1"
 *                       deployDate: "2025-09-09T03:30:00.000Z"
 *                       deployPath: "/opt/backend"
 *                   # 升级历史
 *                   upgradeHistory: []
 *                 - deviceId: "device-002"
 *                   deviceName: "生产服务器-2"
 *                   status: "offline"
 *                   # 系统信息（扁平化）
 *                   platform: "linux"
 *                   osVersion: null
 *                   arch: null
 *                   agentVersion: null
 *                   # 网络信息（扁平化）
 *                   wifiName: null
 *                   wifiSignal: null
 *                   publicIp: null
 *                   localIp: null
 *                   macAddresses: []
 *                   # 版本信息（扁平化）
 *                   frontendVersion: null
 *                   backendVersion: null
 *                   frontendDeployPath: null
 *                   backendDeployPath: null
 *                   # 存储信息（扁平化）
 *                   diskFreeBytes: null
 *                   writable: null
 *                   # 健康状态（扁平化）
 *                   uptimeSeconds: null
 *                   # 连接状态
 *                   connectedAt: "2025-09-09T02:30:00.000Z"
 *                   disconnectedAt: "2025-09-09T02:50:00.000Z"
 *                   lastHeartbeat: "2025-09-09T02:45:00.000Z"
 *                   # 部署能力标识
 *                   hasDeployPath: false
 *                   rollbackAvailable: false
 *                   # 部署详情
 *                   deployInfo:
 *                     rollbackAvailable: false
 *                     lastDeployStatus: null
 *                     lastDeployAt: null
 *                     lastRollbackAt: null
 *                     frontend:
 *                       version: null
 *                       deployDate: null
 *                       deployPath: null
 *                     backend:
 *                       version: null
 *                       deployDate: null
 *                       deployPath: null
 *                   # 升级历史
 *                   upgradeHistory: []
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
router.get('/', getDevices)

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
router.post('/:deviceId/command', sendCommand)

export default router
