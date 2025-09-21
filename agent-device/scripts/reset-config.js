import fs from 'fs-extra'
import path from 'node:path'
import readline from 'node:readline'

const pathsToClean = [
  { label: '设备配置', target: path.resolve('config'), type: 'dir' },
  { label: '下载缓存', target: path.resolve('downloads'), type: 'dir' },
  { label: '部署目录', target: path.resolve('deployed'), type: 'dir' },
  { label: '备份目录', target: path.resolve('backup'), type: 'dir' },
  { label: '日志文件', target: path.resolve('logs'), type: 'dir' }
]

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

console.log('⚠️  该操作将重置设备端配置，使其适合在新机器上重新部署。')
console.log('将要清理以下项目:')
for (const item of pathsToClean) {
  console.log(` - ${item.label}: ${item.target}`)
}

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim().toLowerCase())
    })
  })
}

;(async () => {
  const answer = await ask('是否继续? (yes/no): ')
  rl.close()

  if (!['y', 'yes'].includes(answer)) {
    console.log('已取消重置操作。')
    return
  }

  let successCount = 0

  // 顺序处理文件清理，避免并发删除冲突
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
  console.log('如需重新生成设备 ID，请在下次启动时由系统自动处理。')
})()
