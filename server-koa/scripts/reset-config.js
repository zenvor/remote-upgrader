import fs from 'fs-extra'
import path from 'node:path'
import readline from 'node:readline'

const pathsToClean = [
  { label: '配置目录', target: path.resolve('config') },
  { label: '上传包目录', target: path.resolve('uploads') },
  { label: '日志目录', target: path.resolve('logs') }
]

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

console.log('⚠️  该操作将重置服务端配置，使其适合在新环境重新部署。')
console.log('将要清理以下目录:')
for (const item of pathsToClean) {
  console.log(` - ${item.label}: ${item.target}`)
}

const ask = (q) => new Promise((resolve) => rl.question(q, (ans) => resolve(ans.trim().toLowerCase())))

;(async () => {
  const answer = await ask('是否继续? (yes/no): ')
  rl.close()

  if (!['y', 'yes'].includes(answer)) {
    console.log('已取消重置操作。')
    return
  }

  let successCount = 0

  // 顺序处理目录清理，避免并发删除冲突
  for (const item of pathsToClean) {
    try {
      // eslint-disable-next-line no-await-in-loop -- 顺序删除避免文件系统冲突
      await fs.remove(item.target)
      successCount++
      console.log(`✅ 已清理 ${item.label}`)
    } catch (error) {
      console.warn(`⚠️ 无法清理 ${item.label}: ${error.message}`)
    }
  }

  // 重新创建配置目录，方便后续写入
  try {
    await fs.ensureDir(path.resolve('config'))
    console.log('✅ 已重新创建 config 目录')
  } catch (error) {
    console.warn(`⚠️ 无法重建 config 目录: ${error.message}`)
  }

  console.log(`重置完成，共清理 ${successCount} 个项目。`)
  console.log('服务启动时将自动生成默认配置文件。')
})()
