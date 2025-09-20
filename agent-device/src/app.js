// 使用 ES Module 语法
// 中文注释：设备端入口文件，负责启动 DeviceAgent
import { fileURLToPath } from 'node:url'
import DeviceAgent from './core/deviceAgent.js'
import config from './config/config.js'

export async function start() {
  try {
    console.log('设备代理启动中...')

    const agent = new DeviceAgent(config)
    await agent.start()

    console.log('设备代理已启动')
  } catch (error) {
    console.error('设备代理启动失败:', error)
    process.exit(1)
  }
}

// 优雅关闭处理
process.on('SIGINT', () => {
  console.log('\n正在关闭设备代理...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n正在关闭设备代理...')
  process.exit(0)
})

// 中文注释：ESM 判断是否直接运行当前文件
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  start().catch(console.error)
}
