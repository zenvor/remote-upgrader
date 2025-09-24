# 设备端代理 (Device Agent)

远程升级系统的设备端代理，负责与升级服务器通信，接收和执行升级命令。

## 🚀 快速开始

### 安装依赖

```bash
cd agent-device
npm install
```

### 启动设备代理

```bash
npm start
```

### 重置配置

若需在新机器上重新部署，可使用重置命令清理旧配置与缓存：

```bash
npm run reset-config
```

执行时会提示确认，并删除 `config/`、`downloads/`、`deployed/`、`backup/`、`logs/` 目录；设备 ID 文件会被保留，方便按需继续沿用或手动清理。

或者使用环境变量自定义配置：

```bash
DEVICE_ID=device-001 \
DEVICE_NAME=生产服务器 \
SERVER_URL=http://192.168.1.100:3000 \
npm start
```

## ⚙️ 配置说明

### 环境变量

| 变量名           | 默认值                  | 说明           |
| ---------------- | ----------------------- | -------------- |
| `SERVER_URL`     | `http://localhost:3000` | 升级服务器地址 |
| `DEVICE_ID`      | `device-{timestamp}`    | 设备唯一标识   |
| `DEVICE_NAME`    | `测试设备`              | 设备显示名称   |
| `DEVICE_TYPE`    | `web-terminal`          | 设备类型       |
| `DEVICE_VERSION` | `1.0.0`                 | 设备软件版本   |
| `LOG_LEVEL`      | `info`                  | 日志级别       |

### 配置文件

主配置文件：`src/config/config.js`

- **服务端连接配置**：URL、超时、重连参数
- **设备信息配置**：ID、名称、类型、版本
- **下载配置**：分片大小、重试次数、存储路径
- **部署配置**：前端/后端目录、备份设置
- **日志配置**：级别、文件路径

部署路径记录：`config/deploy-paths.json`

- 自动存储最近一次前端/后端部署路径与更新时间
- 用于后续部署时快速恢复备份目录
- 重置命令会清空此文件以便在新机器重新初始化

## 🔧 核心功能

### 1. Socket.IO 连接管理

- **自动连接**：启动时自动连接到升级服务器
- **心跳机制**：每30秒发送心跳，监控连接状态
- **自动重连**：连接断开时自动尝试重连
- **设备注册**：连接成功后自动注册设备信息

### 2. 命令处理

支持以下远程命令：

#### 升级命令 (cmd:upgrade)

```javascript
{
  command: "cmd:upgrade",
  data: {
    project: "frontend|backend",
    fileName: "app-v1.2.0.zip",
    version: "1.2.0",
    // 可选：部署目录，覆盖默认目录（frontend -> ./deployed/frontend, backend -> ./deployed/backend）
    // 例如：
    // deployPath: "/opt/frontend" 或 "/opt/backend"
    deployPath: "/opt/frontend"
  }
}
```

#### 回滚命令 (cmd:rollback)

```javascript
{
  command: "cmd:rollback",
  data: {
    project: "frontend|backend"
  }
}
```

说明：设备端仅支持回滚到上一份备份版本，命令无需指定目标版本。

#### 状态查询 (cmd:status)

```javascript
{
  command: "cmd:status",
  data: {}
}
```

### 3. 包下载管理

- **断点续传**：支持下载中断后继续
- **MD5校验**：确保下载文件完整性
- **缓存机制**：相同文件避免重复下载
- **进度显示**：实时显示下载进度

### 4. 部署管理

- **自动备份**：部署前自动创建当前版本备份
- **ZIP 格式支持**：支持 ZIP 压缩格式（推荐使用，跨平台兼容性最佳）
- **备份与恢复**：维护上一版本备份，便于快速回滚
- **部署路径识别**：首次部署可从旧项目路径初始化备份，随后自动沿用记录的部署目录
- **服务重启**：后端部署后自动重启服务
- **失败回滚**：部署失败时自动恢复备份
- **自定义部署目录**：升级命令可携带 `deployPath`，将包部署到指定目录（若未提供则使用默认目录）

## 📁 目录结构

```
agent-device/
├── src/
│   ├── app.js              # 应用入口
│   ├── config/
│   │   └── config.js       # 配置文件
│   ├── core/
│   │   ├── deviceAgent.js  # 设备代理核心
│   │   └── socketHandler.js # Socket事件处理
│   └── services/
│       ├── downloadManager.js # 下载管理
│       └── deployManager.js   # 部署管理
├── downloads/              # 下载文件存储
│   ├── temp/              # 临时下载文件
│   └── packages/          # 完整包文件
├── deployed/              # 部署文件
│   ├── frontend/          # 前端文件
│   └── backend/           # 后端文件
├── backup/               # 备份文件
├── logs/                # 日志文件
└── package.json
```

## 🔍 使用示例

### 启动设备代理

```bash
# 基本启动
npm start

# 自定义设备信息启动
DEVICE_ID=server-prod-01 \
DEVICE_NAME="生产服务器01" \
SERVER_URL=http://upgrade.company.com:3000 \
npm start
```

### 查看日志

```bash
tail -f logs/agent.log
```

### 手动测试升级

可以通过服务端的管理界面或 API 向设备发送升级命令：

```bash
# 发送升级命令（在服务端执行）
curl -X POST http://localhost:3000/devices/device-001/command \
  -H "Content-Type: application/json" \
  -d '{
    "command": "cmd:upgrade",
    "data": {
      "project": "frontend",
      "fileName": "app-v1.2.0.zip",
      "version": "1.2.0"
    }
  }'
```

## 🛠 开发调试

### 本地开发

1. 确保升级服务器正在运行 (server-koa)
2. 启动设备代理：`npm run dev`
3. 查看控制台日志了解连接状态

### 常见问题

**连接失败**

- 检查服务器地址和端口是否正确
- 确认网络连接正常
- 查看服务器是否正在运行

**下载失败**

- 检查存储空间是否充足
- 确认网络稳定性
- 查看包文件是否存在于服务器

**部署失败**

- 检查文件权限
- 确认 ZIP 包格式正确（已内置跨平台解压支持）
- 查看目标目录是否可写

## 🔒 安全考虑

- **设备认证**：每个设备需要唯一ID标识
- **命令验证**：所有远程命令都会验证合法性
- **文件校验**：下载的文件必须通过MD5校验
- **备份恢复**：部署失败时自动恢复备份
- **权限控制**：确保部署目录的写入权限

## 📋 监控和维护

### 状态监控

设备代理会定期上报状态信息：

- 连接状态
- 当前版本信息
- 系统资源使用情况
- 最后活动时间

### 日志管理

- **应用日志**：`logs/agent.log`
- **错误日志**：记录所有错误和异常
- **操作日志**：记录升级、回滚操作

### 维护任务

- **清理临时文件**：自动清理超过24小时的临时下载文件
- **备份管理**：自动清理超过配置数量的旧备份
- **日志轮转**：定期清理旧日志文件

---

> 🎯 设备端代理是远程升级系统的重要组成部分，确保升级过程的可靠性和安全性。
