// 中文注释：设备端配置，导出为 ESM 默认导出
export default {
  // 服务端连接配置
  server: {
    url: process.env.SERVER_URL || 'http://localhost:3000',
    reconnectDelay: 3000,
    maxReconnectAttempts: 10,
    timeout: 30000
  },
  
  // 设备信息配置
  device: {
    id: null, // 将在运行时通过 DeviceIdGenerator 生成
    name: process.env.DEVICE_NAME || '测试设备',
    type: process.env.DEVICE_TYPE || 'web-terminal',
    version: process.env.DEVICE_VERSION || '1.0.0',
    platform: process.platform,
    arch: process.arch
  },
  
  // 文件下载配置
  download: {
    chunkSize: 1024 * 1024,  // 1MB 分片大小
    maxRetries: 3,           // 最大重试次数
    retryDelay: 1000,        // 重试延迟
    tempDir: './downloads/temp',      // 临时下载目录
    packageDir: './downloads/packages' // 包存储目录
  },
  
  // 部署配置
  deploy: {
    frontendDir: './deployed/frontend',
    backendDir: './deployed/backend',
    backupDir: './backup',
    maxBackups: 5
  },
  
  // 日志配置
  log: {
    level: process.env.LOG_LEVEL || 'info',
    file: './logs/agent.log'
  }
};