// 中文注释：ESM 导入
import Router from '@koa/router';
import { getDevices, getDeviceDetail, sendCommand, setDeployPath, getDeployPath } from '../controllers/deviceController.js';

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
 *                             description: 部署信息
 *                             properties:
 *                               deployPath:
 *                                 type: string
 *                                 nullable: true
 *                                 description: 部署路径
 *                               rollbackAvailable:
 *                                 type: boolean
 *                                 nullable: true
 *                                 description: 可回滚
 *                               lastDeployStatus:
 *                                 type: string
 *                                 nullable: true
 *                                 description: 最近部署状态
 *                               lastDeployAt:
 *                                 type: string
 *                                 format: date-time
 *                                 nullable: true
 *                                 description: 最近部署时间
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
 *                     deployPath: "/opt/frontend"
 *                     rollbackAvailable: true
 *                     lastDeployStatus: "success"
 *                     lastDeployAt: "2025-09-09T03:35:00.000Z"
 *                   hasDeployPath: true
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
 *                     deployPath: null
 *                     rollbackAvailable: null
 *                     lastDeployStatus: null
 *                     lastDeployAt: null
 *                   hasDeployPath: false
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
 * /devices/{deviceId}:
 *   get:
 *     tags: [Devices]
 *     summary: 获取设备详情
 *     description: 获取指定设备的详细信息，包括连接状态、版本信息等
 *     parameters:
 *       - $ref: '#/components/parameters/DeviceIdParam'
 *     responses:
 *       200:
 *         description: 设备详情获取成功
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     device:
 *                       type: object
 *                       properties:
 *                         deviceId:
 *                           type: string
 *                           description: 设备ID
 *                         deviceName:
 *                           type: string
 *                           description: 设备名称
 *                         version:
 *                           type: string
 *                           description: 设备版本
 *                         system:
 *                           type: object
 *                           description: 系统信息
 *                           properties:
 *                             platform:
 *                               type: string
 *                               description: 设备平台
 *                             osVersion:
 *                               type: string
 *                               nullable: true
 *                               description: 操作系统版本
 *                             arch:
 *                               type: string
 *                               nullable: true
 *                               description: 系统架构
 *                         network:
 *                           type: object
 *                           description: 网络信息
 *                           properties:
 *                             wifiName:
 *                               type: string
 *                               nullable: true
 *                               description: WiFi名称
 *                             wifiSignal:
 *                               type: number
 *                               nullable: true
 *                               description: WiFi信号强度
 *                             publicIp:
 *                               type: string
 *                               nullable: true
 *                               description: 公网IP
 *                             localIp:
 *                               type: string
 *                               nullable: true
 *                               description: 本地IP
 *                             macAddresses:
 *                               type: array
 *                               items: { type: string }
 *                               nullable: true
 *                               description: MAC 地址列表
 *                         status:
 *                           type: string
 *                           enum: [online, offline, upgrading, error]
 *                           description: 设备状态
 *                         connectedAt:
 *                           type: string
 *                           format: date-time
 *                           nullable: true
 *                           description: 连接时间
 *                         disconnectedAt:
 *                           type: string
 *                           format: date-time
 *                           nullable: true
 *                           description: 断开连接时间
 *                         lastHeartbeat:
 *                           type: string
 *                           format: date-time
 *                           nullable: true
 *                           description: 最后心跳时间
 *                         deploy:
 *                           type: object
 *                           description: 部署信息
 *                           properties:
 *                             deployPath:
 *                               type: string
 *                               nullable: true
 *                               description: 部署路径
 *                             rollbackAvailable:
 *                               type: boolean
 *                               nullable: true
 *                               description: 可回滚
 *                             lastDeployStatus:
 *                               type: string
 *                               nullable: true
 *                               description: 最近部署状态
 *                             lastDeployAt:
 *                               type: string
 *                               format: date-time
 *                               nullable: true
 *                               description: 最近部署时间
 *                         hasDeployPath:
 *                           type: boolean
 *                           description: 是否配置了部署路径
 *                         info:
 *                           type: object
 *                           description: 设备详细信息
 *             example:
 *               success: true
 *               device:
 *                 deviceId: "device-001"
 *                 deviceName: "生产服务器-1"
 *                 version: "v1.0.0"
 *                 system:
 *                   platform: "linux"
 *                   osVersion: "5.15"
 *                   arch: "x64"
 *                 agent:
 *                   agentVersion: "1.2.3"
 *                 network:
 *                   wifiName: "Office-WiFi"
 *                   wifiSignal: -45
 *                   publicIp: "203.0.113.1"
 *                   localIp: "192.168.1.100"
 *                   macAddresses: ["AA:BB:CC:DD:EE:FF"]
 *                 storage:
 *                   diskFreeBytes: 123456789
 *                   writable: true
 *                 deploy:
 *                   deployPath: "/opt/frontend"
 *                   rollbackAvailable: true
 *                   lastDeployStatus: null
 *                   lastDeployAt: null
 *                 health:
 *                   uptimeSeconds: 3600
 *                 status: "online"
 *                 connectedAt: "2025-09-09T03:30:00.000Z"
 *                 disconnectedAt: null
 *                 lastHeartbeat: "2025-09-09T03:35:00.000Z"
 *                 hasDeployPath: true
 *                 info:
 *                   deviceName: "生产服务器-1"
 *                   version: "v1.0.0"
 *                   platform: "linux"
 *                   wifiName: "Office-WiFi"
 *                   wifiSignal: -45
 *                   ip: "192.168.1.100"
 *                   hostname: "prod-server-1"
 *       404:
 *         description: 设备不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *             example:
 *               success: false
 *               error: "设备不存在"
 *       500:
 *         description: 服务器内部错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *             example:
 *               success: false
 *               error: "获取设备详情失败"
 */
router.get('/:deviceId', getDeviceDetail);

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

/**
 * @swagger
 * /devices/{deviceId}/deploy-path:
 *   get:
 *     tags: [Devices]
 *     summary: 获取设备的原部署目录路径配置
 *     description: 获取指定设备的原部署目录路径配置信息
 *     parameters:
 *       - $ref: '#/components/parameters/DeviceIdParam'
 *     responses:
 *       200:
 *         description: 获取配置成功
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     config:
 *                       type: object
 *                       properties:
 *                         deviceId:
 *                           type: string
 *                           description: 设备ID
 *                         deployPath:
 *                           type: string
 *                           description: 原部署目录路径
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                           description: 更新时间
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                           description: 创建时间
 *                     hasConfig:
 *                       type: boolean
 *                       description: 是否有配置
 *             example:
 *               success: true
 *               config:
 *                 deviceId: "device-001"
 *                 deployPath: "/opt/frontend"
 *                 updatedAt: "2025-09-10T10:30:00.000Z"
 *                 createdAt: "2025-09-10T10:30:00.000Z"
 *               hasConfig: true
 *       500:
 *         description: 服务器内部错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *             example:
 *               success: false
 *               error: "获取设备配置失败"
 *   post:
 *     tags: [Devices]
 *     summary: 设置设备的原部署目录路径
 *     description: 为指定设备设置原部署目录路径配置
 *     parameters:
 *       - $ref: '#/components/parameters/DeviceIdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - deployPath
 *             properties:
 *               deployPath:
 *                 type: string
 *                 description: 原部署目录路径
 *                 example: "/opt/frontend"
 *           example:
 *             deployPath: "/opt/frontend"
 *     responses:
 *       200:
 *         description: 设置成功
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       description: 成功信息
 *                     config:
 *                       type: object
 *                       properties:
 *                         deviceId:
 *                           type: string
 *                           description: 设备ID
 *                         deployPath:
 *                           type: string
 *                           description: 原部署目录路径
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                           description: 更新时间
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                           description: 创建时间
 *             example:
 *               success: true
 *               message: "原部署目录路径设置成功"
 *               config:
 *                 deviceId: "device-001"
 *                 deployPath: "/opt/frontend"
 *                 updatedAt: "2025-09-10T10:30:00.000Z"
 *                 createdAt: "2025-09-10T10:30:00.000Z"
 *       400:
 *         description: 请求参数错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *             example:
 *               success: false
 *               error: "原部署目录路径不能为空"
 *       404:
 *         description: 设备不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *             example:
 *               success: false
 *               error: "设备不存在"
 *       500:
 *         description: 服务器内部错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *             example:
 *               success: false
 *               error: "设置设备配置失败"
 */
router.get('/:deviceId/deploy-path', getDeployPath);
router.post('/:deviceId/deploy-path', setDeployPath);

export default router;
