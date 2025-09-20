# 远程升级系统 - 服务端

支持前后端分开打包的远程升级系统，提供直接上传、设备管理等功能。

## 🚀 快速开始

### 启动服务

```bash
npm install
npm start
```

服务将在 http://localhost:3000 启动

### 重置配置

如需在新环境重新部署，可一键清理服务端配置：

```bash
npm run reset-config
```

命令会删除 `uploads/`、`logs/`、`temp/` 等目录，并重建空的 `config/devices.json`、`config/packages.json`。

### API 文档

- **主页**: http://localhost:3000/ - 静态文件服务页面
- **Swagger UI**: http://localhost:3000/api-docs - 交互式 API 文档
- **OpenAPI 规范**: http://localhost:3000/swagger.json - JSON 格式规范文件
- **设备命令清单**: ./docs/device-commands.md - 可发送的命令及示例

## 🧪 测试工具

提供 `test-direct-upload.js` 用于测试直接上传接口：

```bash
# 测试直接上传接口
node test-direct-upload.js
```

测试功能：

✅ 直接上传（multipart/form-data）  
✅ 秒传功能（相同 MD5 可复用）  
✅ 完整性校验（文件级 MD5）
✅ 包管理（存储包文件与元数据记录）

## 📋 API 接口

### 上传管理 (Upload)

| 接口             | 方法 | 描述                                    |
| ---------------- | ---- | --------------------------------------- |
| `/upload/direct` | POST | 直接上传文件（表单字段：file, project） |

### 包管理 (Packages)

| 接口                                    | 方法   | 描述       |
| --------------------------------------- | ------ | ---------- |
| `/packages`                             | GET    | 获取包列表 |
| `/packages/:project/:fileName`          | GET    | 获取包详情 |
| `/packages/:project/:fileName`          | DELETE | 删除包     |
| `/packages/:project/:fileName/download` | GET    | 下载包     |

### 设备管理 (Devices)

| 接口                         | 方法 | 描述           |
| ---------------------------- | ---- | -------------- |
| `/devices`                   | GET  | 获取设备列表   |
| `/devices/:deviceId`         | GET  | 获取设备详情   |
| `/devices/:deviceId/command` | POST | 向设备发送命令 |

## 🔧 核心特性

### 1. 上传

- 直接上传：一次性上传完整包文件
- MD5 校验：文件级完整性校验
- 秒传优化：相同文件 MD5 匹配直接秒传

### 2. 文件管理

- **项目分类**: 支持 frontend/backend 独立管理
- **元数据**: 记录包信息（版本、MD5、大小、上传者）
- **版本控制**: 支持多版本包并存
- **完整性保证**: 端到端文件完整性验证

### 3. 设备连接

- **实时通信**: 基于 Socket.IO 的实时连接
- **状态监控**: 设备在线状态和心跳监控
- **命令推送**: 支持升级、降级等远程操作
- **连接管理**: 自动重连和设备注册
- **部署信息记录**: 自动持久化每次部署的版本号、部署路径与时间，便于审计与回滚

### 4. 静态文件服务

- **前端部署**: 自动服务 web 前端打包后的静态文件
- **静态资源**: 支持 HTML、CSS、JS、图片等静态资源
- **缓存优化**: 7天浏览器缓存，gzip 压缩
- **部署目录**: `/server-koa/public/` 目录

## 📁 文件结构

```
server-koa/
├── src/
│   ├── app.js                 # 应用入口
│   ├── config/
│   │   └── swagger.js         # Swagger 配置
│   ├── controllers/           # 控制器
│   │   ├── uploadController.js
│   │   ├── packageController.js
│   │   ├── deviceController.js
│   │   └── socketController.js
│   ├── middleware/            # 中间件
│   │   ├── rawBody.js         # 原始请求体处理
│   │   └── upload.js          # 上传处理
│   ├── models/                # 数据模型
│   │   └── deviceManager.js   # 设备管理
│   ├── routes/                # 路由
│   │   ├── upload.js
│   │   ├── packages.js
│   │   ├── devices.js
│   │   └── docs.js
│   └── utils/
│       └── crypto.js          # 加密工具
├── uploads/                   # 文件存储
│   └── packages/              # 包文件
├── public/                    # 静态文件目录
│   └── index.html             # 默认首页
├── test-upload.js             # 测试工具
└── README.md
```

## 🛠 开发说明

### 环境要求

- Node.js >= 14
- npm >= 6

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev    # 等同于 npm start
```

### 测试 API

使用提供的测试工具：

```bash
node test-direct-upload.js
```

或使用 Swagger UI 在线测试：http://localhost:3000/api-docs

## 📝 使用示例

### 1. 静态文件部署

将前端项目打包后的文件复制到 `public/` 目录：

```bash
# 假设 web-admin 已打包为 dist/ 目录
cp -r ../web-admin/dist/* ./public/

# 或者直接在 web-admin 中配置输出路径
# vite.config.js: build.outDir = '../server-koa/public'
```

### 2. 直接上传示例

```javascript
// 浏览器环境示例
const formData = new FormData()
formData.append('file', fileInput.files[0])
formData.append('project', 'frontend')

const res = await fetch('/upload/direct', {
  method: 'POST',
  body: formData
})
const data = await res.json()
console.log(data)
```

### 3. 设备命令示例

```javascript
// 发送升级命令
await axios.post('/devices/device-001/command', {
  command: 'cmd:upgrade',
  data: {
    project: 'frontend',
    fileName: 'app-v1.0.0.zip'
  }
})

// 发送降级命令
await axios.post('/devices/device-001/command', {
  command: 'cmd:rollback',
  data: {
    project: 'frontend'
  }
})
```

## 🔍 监控和日志

### 文件存储监控

- `uploads/packages/`: 最终包文件
- `logs/`: 系统日志

### 实时状态

- Socket.IO 连接: ws://localhost:3000
- 设备状态监控
- 上传进度跟踪
- 错误日志记录

## 🚨 注意事项

1. **文件大小限制**: 默认服务端 `upload` 中间件限制为 500MB（可配置）
2. **存储空间**: 确保服务器有足够存储空间
3. **MD5 校验**: 所有文件都会进行完整性校验

## 📞 技术支持

如有问题，请查看：

1. **API 文档**: http://localhost:3000/api-docs
2. **测试工具**: `node test-direct-upload.js`
3. **日志文件**: `logs/` 目录
4. **错误排查**: 检查网络连接和文件权限

---

> 🎯 这是一个完整的远程升级系统后端实现，支持直接上传、设备管理等企业级功能。
