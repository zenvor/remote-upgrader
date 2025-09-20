// 使用 ES Module 语法
// 中文注释：设备端入口文件，负责启动 DeviceAgent
import { fileURLToPath } from 'node:url'
import DeviceAgent from './core/deviceAgent.js'
import config from './config/config.js'

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
    process.exit(1)
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
    process.exit(0)
  } catch (error) {
    console.error('❌ 关闭过程中发生错误:', error.message)
    process.exit(1)
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

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
