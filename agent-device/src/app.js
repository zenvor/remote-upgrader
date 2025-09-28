// 使用 ES Module 语法
// 中文注释：设备端入口文件，负责启动 DeviceAgent
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import config from './config/config.js'
import DeviceAgent from './core/deviceAgent.js'
import logger from './utils/logger.js'

let agent = null

export async function start() {
  try {
    logger.info('设备代理启动中...')

    agent = new DeviceAgent(config)
    await agent.start()

    logger.info('设备代理已启动')
    return agent
  } catch (error) {
    logger.error('设备代理启动失败:', error.message)
    if (error.stack) {
      logger.debug('错误堆栈:', error.stack)
    }
    throw error
  }
}

// 处理 SIGINT 信号（Ctrl+C）- 立即退出
process.on('SIGINT', () => {
  logger.info('接收到 SIGINT 信号，立即退出程序')
  // eslint-disable-next-line n/no-process-exit -- 用户要求立即退出
  process.exit(0)
})

// 处理 SIGTERM 信号 - 立即退出
process.on('SIGTERM', () => {
  logger.info('接收到 SIGTERM 信号，立即退出程序')
  // eslint-disable-next-line n/no-process-exit -- 立即退出
  process.exit(0)
})

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常:', error.message)
  logger.debug('错误堆栈:', error.stack)
  // eslint-disable-next-line n/no-process-exit -- 异常时立即退出
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  // 检查是否为 Git 文件相关的错误
  const isGitRelatedError = (error) => {
    if (!error) return false

    const errorMessage = error.message || error.toString()
    const errorPath = error.path || ''

    // 检查错误消息或路径是否与 Git 相关
    return errorMessage.includes('.git') ||
           errorPath.includes('.git') ||
           errorMessage.includes('no such file or directory') && errorPath.includes('.git')
  }

  // 如果是 Git 相关错误，只记录警告不终止进程
  if (isGitRelatedError(reason)) {
    logger.warn('检测到 Git 文件相关错误（已安全忽略）:', reason)
    return
  }

  // 其他未处理的 Promise 拒绝立即退出
  logger.error('未处理的 Promise 拒绝:', reason)
  logger.debug('Promise 对象:', promise)
  // eslint-disable-next-line n/no-process-exit -- Promise 拒绝时立即退出
  process.exit(1)
})

// 中文注释：ESM 判断是否直接运行当前文件（兼容 PM2）
const argvPath = process.argv[1] && path.resolve(process.argv[1])
const isMain = argvPath && argvPath === fileURLToPath(import.meta.url)

// PM2 下也视为主进程
const isPm2 = !!process.env.pm_id

if (isMain || isPm2) {
  start().catch((error) => {
    logger.error('设备代理启动异常中止:', error)
  })
}
