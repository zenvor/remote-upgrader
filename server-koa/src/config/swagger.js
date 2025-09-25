// 中文注释：ESM 导入
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import swaggerJSDoc from 'swagger-jsdoc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Swagger 配置
const swaggerOptions = {
  definition: {
    openapi: '3.1.1',
    info: {
      title: '远程升级系统 API',
      version: '1.0.0',
      description: '支持前后端分开打包的远程升级系统，提供直接上传、设备管理等功能',
      contact: {
        name: 'API 支持',
        email: process.env.SUPPORT_EMAIL || 'support@example.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: process.env.SWAGGER_SERVER_URL || 'http://localhost:3000',
        description: '开发环境'
      },
      {
        url: process.env.PRODUCTION_SERVER_URL || 'https://api.upgrade.example.com',
        description: '生产环境'
      }
    ],
    components: {
      schemas: {
        // 通用响应模型
        ApiResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: '操作是否成功'
            },
            message: {
              type: 'string',
              description: '响应消息'
            },
            error: {
              type: 'string',
              description: '错误信息（仅在失败时返回）'
            }
          },
          required: ['success']
        },

        // 包信息
        Package: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              enum: ['frontend', 'backend'],
              description: '项目类型'
            },
            fileName: {
              type: 'string',
              description: '文件名'
            },
            fileSize: {
              type: 'integer',
              description: '文件大小（字节）'
            },
            fileMD5: {
              type: 'string',
              description: '文件 MD5 哈希值'
            },
            packagePath: {
              type: 'string',
              description: '包文件路径'
            }
          }
        },

        // 设备信息（扁平化结构）
        Device: {
          type: 'object',
          properties: {
            // 基本信息
            deviceId: { type: 'string', description: '设备ID' },
            deviceName: { type: 'string', description: '设备名称' },
            status: {
              type: 'string',
              enum: ['online', 'offline', 'upgrading', 'error'],
              description: '设备状态'
            },

            // 系统信息（扁平化）
            platform: { type: 'string', nullable: true, description: '设备平台' },
            osVersion: { type: 'string', nullable: true, description: '操作系统版本' },
            arch: { type: 'string', nullable: true, description: '系统架构' },
            agentVersion: { type: 'string', nullable: true, description: '设备代理版本' },

            // 网络信息（扁平化）
            wifiName: { type: 'string', nullable: true, description: 'WiFi 名称' },
            wifiSignal: { type: 'number', nullable: true, description: 'WiFi 信号强度' },
            localIp: { type: 'string', nullable: true, description: '本地 IP' },
            macAddresses: {
              type: 'array',
              items: { type: 'string' },
              description: 'MAC 地址列表'
            },

            // 版本信息（扁平化）
            frontendVersion: { type: 'string', nullable: true, description: '前端版本' },
            backendVersion: { type: 'string', nullable: true, description: '后端版本' },
            frontendDeployPath: { type: 'string', nullable: true, description: '前端部署路径' },
            backendDeployPath: { type: 'string', nullable: true, description: '后端部署路径' },

            // 存储信息（扁平化）
            diskFreeBytes: { type: 'integer', nullable: true, description: '部署分区可用空间（字节）' },
            writable: { type: 'boolean', nullable: true, description: '部署目录可写' },

            // 健康状态（扁平化）
            uptimeSeconds: { type: 'integer', nullable: true, description: '运行时长（秒）' },

            // 连接信息
            connectedAt: { type: 'string', format: 'date-time', nullable: true, description: '连接时间' },
            disconnectedAt: { type: 'string', format: 'date-time', nullable: true, description: '断开连接时间' },
            lastHeartbeat: { type: 'string', format: 'date-time', nullable: true, description: '最后心跳时间' },

            // 部署能力标识
            hasDeployPath: { type: 'boolean', description: '是否已配置部署路径' },
            rollbackAvailable: { type: 'boolean', nullable: true, description: '可回滚' },

            // 部署详情（用于详情页面显示）
            deployInfo: {
              type: 'object',
              description: '部署详细信息',
              properties: {
                rollbackAvailable: { type: 'boolean', nullable: true, description: '可回滚' },
                lastDeployStatus: { type: 'string', nullable: true, description: '最近部署状态' },
                lastDeployAt: { type: 'string', format: 'date-time', nullable: true, description: '最近部署时间' },
                lastRollbackAt: { type: 'string', format: 'date-time', nullable: true, description: '最近回滚时间' },
                frontend: {
                  type: 'object',
                  nullable: true,
                  description: '前端部署信息',
                  properties: {
                    version: { type: 'string', nullable: true, description: '版本号' },
                    deployDate: { type: 'string', format: 'date-time', nullable: true, description: '部署时间' },
                    deployPath: { type: 'string', nullable: true, description: '部署路径' }
                  }
                },
                backend: {
                  type: 'object',
                  nullable: true,
                  description: '后端部署信息',
                  properties: {
                    version: { type: 'string', nullable: true, description: '版本号' },
                    deployDate: { type: 'string', format: 'date-time', nullable: true, description: '部署时间' },
                    deployPath: { type: 'string', nullable: true, description: '部署路径' }
                  }
                }
              }
            },

            // 升级历史
            upgradeHistory: {
              type: 'array',
              items: { type: 'object' },
              description: '升级历史记录'
            }
          }
        },

        // 发送命令请求
        SendCommandRequest: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: '命令名称',
              example: 'cmd:upgrade'
            },
            data: {
              type: 'object',
              description:
                '命令数据（随命令变化）。支持的命令详见 /docs/device-commands 文档。常用命令：cmd:upgrade, cmd:rollback, cmd:status, getCurrentVersion'
            }
          },
          required: ['command']
        }
      },

      // 参数定义
      parameters: {
        ProjectParam: {
          name: 'project',
          in: 'path',
          required: true,
          schema: {
            type: 'string',
            enum: ['frontend', 'backend']
          },
          description: '项目类型'
        },
        FileNameParam: {
          name: 'fileName',
          in: 'path',
          required: true,
          schema: {
            type: 'string'
          },
          description: '文件名'
        },
        DeviceIdParam: {
          name: 'deviceId',
          in: 'path',
          required: true,
          schema: {
            type: 'string'
          },
          description: '设备ID'
        }
      }
    },

    tags: [
      {
        name: 'Upload',
        description: '上传管理'
      },
      {
        name: 'Packages',
        description: '包管理'
      },
      {
        name: 'Devices',
        description: '设备管理'
      },
      {
        name: '版本管理',
        description: '查询当前部署版本并执行单步回滚'
      },
      {
        name: '批量操作',
        description: '批量升级和回滚任务管理'
      }
    ]
  },
  apis: [path.join(__dirname, '../routes/*.js'), path.join(__dirname, '../controllers/*.js')]
}

// 生成 Swagger 规范
const swaggerSpec = swaggerJSDoc(swaggerOptions)

export default swaggerSpec
