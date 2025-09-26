// 中文注释：加载环境变量配置
import dotenv from 'dotenv'

dotenv.config()

// 中文注释：设备端配置，导出为 ESM 默认导出
export default {
  // 服务端连接配置
  server: {
    url: process.env.SERVER_URL || 'http://localhost:3000', // 服务端地址
    reconnectDelay: 3000, // 重连延迟
    maxReconnectAttempts: 10, // 最大重连次数
    timeout: 30_000 // 超时时间
  },

  // 设备信息配置
  device: {
    id: null, // 将在运行时通过 DeviceIdGenerator 生成
    name: process.env.DEVICE_NAME || '未知设备', // 设备名称
    useRealHostname: process.env.USE_REAL_HOSTNAME === 'true', // 是否使用真实主机名（不添加进程ID后缀）
    preferConfigName: process.env.PREFER_CONFIG_NAME === 'true', // 是否优先使用配置的设备名称而不是系统主机名
    platform: process.platform, // 设备平台
    arch: process.arch // 设备架构
  },

  // 文件下载配置
  download: {
    chunkSize: 1024 * 1024, // 1MB 分片大小
    maxRetries: 3, // 最大重试次数
    retryDelay: 1000, // 重试延迟
    tempDir: './downloads/temp', // 临时下载目录 先下载到临时目录，验证无误再移动到包存储目录
    packageDir: './downloads/packages' // 包存储目录
  },

  // 部署配置
  deploy: {
    frontendDir: './deployed/frontend', // 前端部署目录
    backendDir: './deployed/backend', // 后端部署目录
    backupDir: './backup', // 备份目录
    maxBackups: 10 // 最大备份数量
  },

  // 日志配置
  log: {
    level: process.env.LOG_LEVEL || 'info', // 日志级别
    file: './logs/agent.log' // 日志文件路径
  }
}
