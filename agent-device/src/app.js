// 使用 ES Module 语法
// 中文注释：设备端入口文件，负责启动 DeviceAgent
import { fileURLToPath } from 'node:url'
import config from './config/config.js'
import DeviceAgent from './core/deviceAgent.js'

let agent = null

export async function start() {
  try {
    console.log('🚀 设备代理启动中...')

    agent = new DeviceAgent(config)
    await agent.start()

    console.log('✅ 设备代理已启动')
    return agent
  } catch (error) {
    console.error('❌ 设备代理启动失败:', error.message)
    if (error.stack) {
      console.error('错误堆栈:', error.stack)
    }
    throw error
  }
}

// 优雅关闭处理
async function gracefulShutdown(signal) {
  console.log(`\n📥 接收到${signal}信号，正在优雅关闭设备代理...`)

  try {
    if (agent) {
      await agent.gracefulShutdown()
    }
    console.log('✅ 设备代理已安全关闭')
    // eslint-disable-next-line n/no-process-exit -- 信号处理器需要强制退出进程
    process.exit(0)
  } catch (error) {
    console.error('❌ 关闭过程中发生错误:', error.message)
    // eslint-disable-next-line n/no-process-exit -- 错误情况下需要强制退出进程
    process.exit(1)
  }
}

// 添加强制退出超时保护
let isShuttingDown = false

// 处理 SIGINT 信号（Ctrl+C）
process.on('SIGINT', async () => {
  if (isShuttingDown) {
    console.log('\n⚠️ 强制退出...')
    // eslint-disable-next-line n/no-process-exit -- 重复信号需要强制退出
    process.exit(1)
  }
  isShuttingDown = true

  // 设置强制退出超时（5秒）
  const forceExitTimer = setTimeout(() => {
    console.log('\n⏰ 优雅关闭超时，强制退出')
    // eslint-disable-next-line n/no-process-exit -- 超时保护需要强制退出
    process.exit(1)
  }, 5000)

  try {
    await gracefulShutdown('SIGINT')
    clearTimeout(forceExitTimer)
  } catch {
    clearTimeout(forceExitTimer)
    // eslint-disable-next-line n/no-process-exit -- 关闭失败需要强制退出
    process.exit(1)
  }
})

// 处理 SIGTERM 信号
process.on('SIGTERM', async () => {
  await gracefulShutdown('SIGTERM')
})

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  console.error('❌ 未捕获的异常:', error.message)
  console.error('错误堆栈:', error.stack)
  gracefulShutdown('uncaughtException')
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未处理的Promise拒绝:', reason)
  console.error('Promise:', promise)
  gracefulShutdown('unhandledRejection')
})

// 中文注释：ESM 判断是否直接运行当前文件
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  start().catch(console.error)
}
