# 远程升级系统

一个基于 Node.js + Socket.IO 的设备远程升级解决方案，支持前后端分离部署、实时升级管理和批量操作。

## 📋 项目概述

该系统包含以下核心模块：

- **服务端 (server-koa)**: 基于 Koa.js 的升级服务器，提供 RESTful API、Socket.IO 连接管理和 Swagger 文档
- **设备代理 (agent-device)**: 运行在目标设备上的升级代理，负责与服务器通信和本地升级操作
- **管理后台 (web-admin)**: 基于 Vue 3 + Ant Design Vue 的现代化管理界面，支持设备管理、包管理、版本管理和批量任务

## 🚀 快速开始

### 环境要求

- Node.js >= 18.0.0
- npm >= 8.0.0
- PM2 >= 5.0.0 (生产环境)

### 安装和运行

1. **克隆项目**
   ```bash
   git clone https://github.com/zenvor/remote-upgrader
   cd remote-upgrader
   ```

2. **安装依赖**
   ```bash
   # 安装服务端依赖
   cd server-koa
   npm install

   # 安装管理后台依赖
   cd ../web-admin
   npm install

   # 安装设备端依赖
   cd ../agent-device
   npm install
   ```

3. **配置环境**
   ```bash
   # 服务端配置
   cd server-koa
   cp .env.example .env
   # 编辑 .env 文件配置服务器参数

   # 管理后台配置
   cd ../web-admin
   cp .env.example .env
   # 编辑 .env 文件配置 API 地址等参数

   # 设备端配置
   cd ../agent-device
   cp .env.example .env
   # 编辑 .env 文件配置设备参数和服务器地址
   ```

4. **启动服务**
   ```bash
   # 启动服务端（终端 1）
   cd server-koa
   npm run dev

   # 启动管理后台（终端 2）
   cd web-admin
   npm run dev

   # 启动设备端（终端 3）
   cd agent-device
   npm start
   ```

## 📁 项目结构

```
remote-upgrader/
├── server-koa/                 # 升级服务器
│   ├── src/
│   │   ├── controllers/       # 控制器
│   │   ├── models/           # 数据模型
│   │   ├── routes/           # 路由定义（包含 Swagger 文档）
│   │   ├── services/         # 业务逻辑服务
│   │   ├── socket/           # Socket.IO 事件处理
│   │   └── utils/            # 工具函数
│   ├── data/                 # 数据存储（JSON 数据库）
│   ├── uploads/              # 上传文件存储
│   └── ecosystem.config.cjs  # PM2 配置
├── web-admin/                 # 管理后台
│   ├── src/
│   │   ├── api/              # API 接口封装
│   │   ├── components/       # 全局组件
│   │   ├── router/           # 路由配置
│   │   ├── services/         # 服务层（Socket.IO 等）
│   │   ├── stores/           # Pinia 状态管理
│   │   ├── utils/            # 工具函数
│   │   └── views/            # 页面组件
│   └── ecosystem.config.cjs  # PM2 配置
├── agent-device/              # 设备代理
│   ├── src/
│   │   ├── core/             # 核心功能（升级、下载等）
│   │   ├── services/         # 服务层（Socket.IO 等）
│   │   └── utils/            # 工具函数
│   ├── data/                 # 本地数据存储
│   └── ecosystem.config.cjs  # PM2 配置
├── CLAUDE.md                  # 项目开发规范
├── PM2开机自启动配置指南.md    # PM2 配置文档
└── README.md
```

## 🔧 核心功能

### 服务端功能 (server-koa)
- ✅ RESTful API 接口与 Swagger 文档
- ✅ 设备管理：设备注册、连接管理、心跳检测
- ✅ 包管理：上传、下载、MD5 校验
- ✅ 版本管理：版本发布、版本与包关联
- ✅ 批量任务：批量升级、批量操作、任务调度
- ✅ Socket.IO 实时通信：设备状态、操作进度广播
- ✅ 文件存储与管理
- ✅ 操作历史记录

### 管理后台功能 (web-admin)
- ✅ 设备管理：设备列表、在线状态、远程操作
- ✅ 包管理：上传包、查看包详情、删除包
- ✅ 版本管理：创建版本、关联包、版本发布
- ✅ 批量任务：创建批量任务、任务进度监控、任务管理
- ✅ 实时通知：设备上下线、操作进度实时更新
- ✅ 操作日志：查看操作历史和详情
- ✅ 响应式设计：支持各种屏幕尺寸

### 设备端功能 (agent-device)
- ✅ 自动连接和重连机制
- ✅ 文件下载和 MD5 校验
- ✅ 升级包解压和部署
- ✅ 系统信息采集和上报
- ✅ 远程命令执行（重启、升级等）
- ✅ 操作进度实时上报
- ✅ 路径安全验证
- ✅ 错误处理和恢复机制

## 🛡️ 安全特性

- ✅ CORS 跨域安全配置
- ✅ 文件路径注入防护
- ✅ MD5 文件完整性校验
- ✅ Socket.IO 连接认证
- ✅ 环境变量配置管理
- ✅ 设备唯一标识验证
- ✅ 文件上传大小限制

## 📊 监控和日志

- ✅ 设备在线状态实时监控
- ✅ 操作历史记录和查询
- ✅ 批量任务进度跟踪
- ✅ 设备系统信息监控
- ✅ Socket.IO 连接状态监控
- ✅ PM2 进程管理和日志

## 🔄 部署说明

### 生产环境部署（推荐使用 PM2）

1. **服务端部署**
   ```bash
   cd server-koa
   npm install --production
   npm run deploy:prod    # 使用 PM2 部署
   ```

2. **管理后台部署**
   ```bash
   cd web-admin
   npm install
   npm run deploy:prod    # 构建并使用 PM2 部署
   ```

3. **设备端部署**
   ```bash
   cd agent-device
   npm install --production
   npm run deploy:prod    # 使用 PM2 部署
   ```

### PM2 常用命令

```bash
npm run status        # 查看运行状态
npm run logs          # 查看日志
npm run restart:pm2   # 重启服务
npm run stop:pm2      # 停止服务
npm run monitor       # 实时监控
```

### PM2 开机自启动

详见 [PM2开机自启动配置指南.md](PM2开机自启动配置指南.md)

### 访问地址

- **管理后台**: http://localhost:5050 (默认)
- **API 文档**: http://localhost:3003/docs (Swagger UI)
- **API 服务**: http://localhost:3003/api

## 🤝 开发指南

### 代码风格
- 使用 ESM 模块格式（`"type": "module"`）
- 遵循中文注释规范
- 采用 camelCase 命名约定
- 保持代码简洁和可读性
- 使用 ESLint + Prettier 进行代码格式化

### 开发规范
详见 [CLAUDE.md](CLAUDE.md) 项目开发规范文档，包含：
- Vue 组件开发最佳实践
- API 接口开发规范
- 表单数据管理模式
- 前后端协作规范

### 提交规范
- 使用语义化提交消息（feat/fix/docs/chore 等）
- 功能开发使用 feature 分支
- 代码审查后合并到 main 分支

### 测试和调试
```bash
# 服务端
cd server-koa
npm run lint          # 代码检查
npm run format        # 代码格式化

# 管理后台
cd web-admin
npm run lint          # 代码检查
npm run format        # 代码格式化

# 设备端
cd agent-device
npm run lint          # 代码检查
npm run format        # 代码格式化
```

## 📝 更新日志

### v1.0.0 (2024-09)
- ✅ 完整的远程升级系统（服务端 + 设备端 + 管理后台）
- ✅ 设备管理：注册、连接、心跳检测、状态监控
- ✅ 包管理：上传、下载、MD5 校验、存储管理
- ✅ 版本管理：版本发布、包关联、版本控制
- ✅ 批量任务：批量升级、任务调度、进度跟踪
- ✅ 实时通信：Socket.IO 双向通信、设备状态广播、操作进度实时更新
- ✅ 管理后台：Vue 3 + Ant Design Vue、响应式设计、实时通知
- ✅ 安全加固：路径注入防护、文件校验、设备认证
- ✅ 生产部署：PM2 进程管理、开机自启动、日志管理
- ✅ API 文档：Swagger 自动生成文档
- ✅ 代码质量：ESLint + Prettier、统一代码风格

## 🎯 技术栈

### 服务端 (server-koa)
- Koa.js - Web 框架
- Socket.IO - 实时双向通信
- Swagger - API 文档自动生成
- PM2 - 进程管理
- dotenv - 环境变量管理

### 管理后台 (web-admin)
- Vue 3 - 渐进式前端框架
- Ant Design Vue - UI 组件库
- Vite - 构建工具
- Vue Router - 路由管理
- Socket.IO Client - 实时通信客户端
- Axios - HTTP 客户端

### 设备端 (agent-device)
- Node.js - 运行时环境
- Socket.IO Client - 实时通信
- systeminformation - 系统信息采集
- adm-zip - 压缩包处理
- PM2 - 进程管理

## 🐛 问题反馈

请在 [Issues](https://github.com/zenvor/remote-upgrader/issues) 页面提交问题和建议。

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 👥 贡献者

- [@zenvor](https://github.com/zenvor) - 项目维护者