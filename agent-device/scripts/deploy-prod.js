#!/usr/bin/env node

/**
 * 跨平台生产环境部署脚本
 * 解决 Windows 和 Unix 系统的命令差异问题
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 颜色输出函数
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function deployProd() {
  try {
    log('🚀 开始部署生产环境...', 'blue');

    // 步骤 1: 安装依赖
    log('📦 安装依赖...', 'yellow');
    execSync('npm install', { stdio: 'inherit' });

    // 步骤 2: 确保 logs 目录存在
    log('📁 创建日志目录...', 'yellow');
    const logsDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // 步骤 3: 停止现有进程（忽略错误）
    log('🛑 停止现有进程...', 'yellow');
    try {
      execSync('pm2 delete ecosystem.config.cjs', { stdio: 'ignore' });
    } catch (error) {
      // 忽略错误，可能进程不存在
      log('ℹ️  没有找到现有进程，继续部署', 'blue');
    }

    // 步骤 4: 启动生产环境
    log('🎯 启动生产环境...', 'yellow');
    execSync('pm2 start ecosystem.config.cjs --env production', { stdio: 'inherit' });

    log('✅ 部署完成！', 'green');
    log('📊 查看状态: npm run status', 'blue');
    log('📝 查看日志: npm run logs', 'blue');

  } catch (error) {
    log(`❌ 部署失败: ${error.message}`, 'red');
    process.exit(1);
  }
}

deployProd();