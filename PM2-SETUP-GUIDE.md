# PM2 开机自启配置指南

本项目提供了跨平台的 PM2 自启脚本，支持 Windows、Linux 和 macOS。

## 快速开始

### Windows

1. **以管理员身份打开 PowerShell 或 CMD**

2. **运行配置脚本**
   ```powershell
   .\setup-pm2-autostart.bat
   ```

3. **脚本会自动：**
   - 检查 Node.js 和 npm
   - 安装 PM2（如果未安装）
   - 启动项目服务
   - 配置开机自启
   - 保存进程列表

### Linux / macOS

1. **给脚本添加执行权限**
   ```bash
   chmod +x setup-pm2-autostart.sh
   ```

2. **运行配置脚本**
   ```bash
   # Linux 需要 sudo
   sudo ./setup-pm2-autostart.sh

   # macOS 可以直接运行（首次可能需要输入密码）
   ./setup-pm2-autostart.sh
   ```

3. **脚本会自动：**
   - 检查 Node.js 和 npm
   - 安装 PM2（如果未安装）
   - 启动项目服务
   - 配置开机自启（systemd for Linux, launchd for macOS）
   - 保存进程列表

## 原理说明

### Windows
- 使用 `pm2 startup windows-startup` 创建 Windows 服务
- 服务在系统启动时自动运行
- 管理员权限是必需的

### Linux
- 使用 `systemd` 作为初始化系统
- `pm2 startup systemd` 生成并注册 systemd 服务
- 进程在系统启动时自动运行
- Root 权限是必需的（通过 sudo）

### macOS
- 使用 `launchd` 作为进程管理器
- `pm2 startup launchd` 创建 LaunchAgent 配置文件
- 进程在系统启动时自动运行
- 可以以普通用户身份运行

## 验证配置

配置完成后，可以通过以下命令验证：

```bash
# 查看进程列表
pm2 list

# 查看进程详情
pm2 show admin-server

# 查看日志
pm2 logs admin-server

# 查看实时状态
pm2 monit
```

## 测试开机自启

1. **停止进程**
   ```bash
   pm2 kill
   ```

2. **重启系统**
   ```bash
   # Windows
   shutdown /r /t 0

   # Linux/macOS
   sudo reboot
   ```

3. **验证进程是否自动启动**
   ```bash
   pm2 list
   ```

如果看到 `admin-server` 进程处于运行状态，说明开机自启配置成功。

## 常用命令

### 进程管理
```bash
pm2 start admin-server          # 启动进程
pm2 stop admin-server           # 停止进程
pm2 restart admin-server        # 重启进程
pm2 delete admin-server         # 删除进程
pm2 list                        # 查看所有进程
```

### 日志查看
```bash
pm2 logs admin-server           # 查看实时日志
pm2 logs admin-server --lines 100  # 查看最后 100 行日志
pm2 logs admin-server --err     # 只查看错误日志
```

### 环境和配置
```bash
pm2 save                        # 保存当前进程列表
pm2 resurrect                   # 恢复已保存的进程
pm2 kill                        # 停止 PM2 守护进程
pm2 show admin-server           # 查看进程详细信息
```

### 开机自启管理
```bash
# Linux
sudo pm2 startup systemd -u $USER --hp $HOME
sudo pm2 save

# macOS
pm2 startup launchd -u $USER --hp $HOME
pm2 save

# Windows
pm2 startup windows-startup
pm2 save
```

## 环境变量配置

可以通过 `ecosystem.config.cjs` 或环境变量覆盖默认配置：

```bash
# 改变端口
PORT=8080 npm run start:pm2

# 改变主机地址
HOST=127.0.0.1 npm run start:pm2

# 改变运行环境
NODE_ENV=production npm run start:pm2
```

## 常见问题

### Q: 脚本执行失败说权限不足？

**A:**
- **Windows**: 右键脚本选择"以管理员身份运行"
- **Linux**: 使用 `sudo ./setup-pm2-autostart.sh`
- **macOS**: 脚本会自动请求 sudo 权限

### Q: PM2 进程没有自动启动？

**A:**
1. 检查进程列表是否被保存：`pm2 list`
2. 确保运行了 `pm2 save` 命令
3. 检查系统启动日志：
   - **Linux**: `journalctl -u pm2-$USER.service -n 50`
   - **macOS**: `log stream --predicate 'eventMessage contains "pm2"'`
   - **Windows**: 事件查看器 → 应用程序日志

### Q: 如何禁用开机自启？

**A:**
```bash
# Linux
sudo pm2 unstartup systemd -u $USER

# macOS
pm2 unstartup launchd -u $USER

# Windows
pm2 kill
```

### Q: 脚本卡住或无响应？

**A:**
1. 按 `Ctrl+C` 中断脚本
2. 检查 `npm run deploy:prod` 是否在工作
3. 查看 `logs/` 目录下的日志文件
4. 手动运行命令进行调试

## 日志位置

PM2 自动生成的日志文件位置：

**项目日志**
```
logs/
├── server-combined.log   # 完整日志
├── server-out.log        # 标准输出
└── server-error.log      # 错误日志
```

**PM2 系统日志**
- **Linux**: `~/.pm2/logs/`
- **macOS**: `~/.pm2/logs/`
- **Windows**: `%APPDATA%\pm2\logs\`

## 后续部署

项目提供了快速部署命令：

```bash
# 仅重启（不更新依赖）
npm run restart:prod

# 更新依赖并重启
npm run redeploy:prod

# 完整部署（清理旧进程 + 启动）
npm run deploy:prod
```

## 技术细节

### 配置文件说明

**ecosystem.config.cjs** 中的关键参数：

```javascript
{
  name: 'admin-server',              // 进程名称
  script: './src/server.js',         // 启动脚本
  instances: 1,                      // 进程实例数
  exec_mode: 'fork',                 // 执行模式
  max_memory_restart: '1G',          // 内存限制
  min_uptime: '10s',                 // 最小稳定时间
  max_restarts: 10,                  // 最大重启次数
  restart_delay: 4000,               // 重启延迟
  log_date_format: 'YYYY-MM-DD HH:mm:ss Z'  // 日志时间格式
}
```

### 进程监控

PM2 会自动：
- 监控进程崩溃并自动重启
- 收集日志和错误信息
- 限制内存使用
- 管理多个应用实例
- 提供文件修改监控（可选）

## 支持和调试

如果遇到问题，可以收集以下信息：

```bash
# 导出进程信息
pm2 show admin-server

# 导出整个 PM2 状态
pm2 dump

# 查看 PM2 日志
pm2 logs PM2

# 检查系统信息
node -v && npm -v && pm2 -v
```

然后查看对应系统的日志文件定位问题。
