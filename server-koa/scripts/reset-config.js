#!/usr/bin/env node

import path from 'node:path'
import readline from 'node:readline'
import fs from 'fs-extra'

const rootDir = process.cwd()

const dirsToClean = [
  { label: '上传包目录', target: path.join(rootDir, 'uploads') },
  { label: '日志目录', target: path.join(rootDir, 'logs') }
]

const filesToReset = [
  {
    label: '设备配置文件',
    target: path.join(rootDir, 'config/devices.json'),
    defaultContent: {
      devices: {},
      settings: {
        heartbeatTimeout: 60_000,
        maxConnectionHistory: 20,
        maxUpgradeHistory: 10,
        autoCleanupOfflineDevices: false,
        offlineCleanupDays: 7
      },
      statistics: {
        totalDevices: 0,
        onlineDevices: 0,
        totalConnections: 0,
        lastUpdated: null
      }
    }
  },
  {
    label: '包配置文件',
    target: path.join(rootDir, 'config/packages.json'),
    defaultContent: {
      packages: {
        frontend: { packages: {} },
        backend: { packages: {} }
      },
      lastSyncedAt: null
    }
  }
]

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

console.log('⚠️  该操作将重置服务端配置，使其适合在新环境重新部署。')
console.log('将要清理以下目录/文件:')
for (const item of dirsToClean) {
  console.log(` - ${item.label}: ${item.target}`)
}

for (const file of filesToReset) {
  console.log(` - ${file.label}: ${file.target}`)
}

const ask = (q) => new Promise((resolve) => rl.question(q, (ans) => resolve(ans.trim().toLowerCase())))

;(async () => {
  const answer = await ask('是否继续? (yes/no): ')
  rl.close()

  if (!['y', 'yes'].includes(answer)) {
    console.log('已取消重置操作。')
    process.exit(0)
  }

  for (const dir of dirsToClean) {
    try {
      await fs.remove(dir.target)
      console.log(`✅ 已清理 ${dir.label}`)
    } catch (error) {
      console.warn(`⚠️ 无法清理 ${dir.label}: ${error.message}`)
    }
  }

  for (const file of filesToReset) {
    try {
      await fs.ensureDir(path.dirname(file.target))
      await fs.writeJson(file.target, file.defaultContent, { spaces: 2 })
      console.log(`✅ 已重置 ${file.label}`)
    } catch (error) {
      console.warn(`⚠️ 无法重置 ${file.label}: ${error.message}`)
    }
  }

  console.log('服务端配置重置完成。')
})()
