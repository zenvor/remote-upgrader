# 远程升级系统

一个基于 Node.js + Socket.IO 的设备远程升级解决方案，支持前后端分离部署和实时升级管理。

## 📋 项目概述

该系统包含以下核心模块：

- **服务端 (server-koa)**: 基于 Koa.js 的升级服务器，提供 REST API 和 Socket.IO 连接管理
- **设备代理 (agent-device)**: 运行在目标设备上的升级代理，负责与服务器通信和本地升级操作
- **前端界面**: 基于 Vue.js 的管理界面（开发中）

## 🚀 快速开始

### 环境要求

- Node.js >= 16.0.0
- npm >= 8.0.0

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

   # 设备端配置
   cd ../agent-device
   cp .env.example .env
   # 编辑 .env 文件配置设备参数
   ```

4. **启动服务**
   ```bash
   # 启动服务端
   cd server-koa
   npm run dev

   # 启动设备端（新终端窗口）
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
│   │   ├── routes/           # 路由定义
│   │   ├── services/         # 业务逻辑服务
│   │   └── utils/            # 工具函数
│   ├── config/               # 配置文件
│   ├── uploads/              # 上传文件存储
│   └── package.json
├── agent-device/              # 设备代理
│   ├── src/
│   │   ├── core/             # 核心功能
│   │   ├── services/         # 服务层
│   │   └── utils/            # 工具函数
│   ├── config/               # 配置文件
│   └── package.json
├── docs/                      # 项目文档
├── AUDIT_REPORT.md           # 代码审计报告
└── README.md
```

## 🔧 核心功能

### 服务端功能
- ✅ 文件上传和 MD5 校验
- ✅ 设备连接管理和心跳检测
- ✅ Socket.IO 实时通信
- ✅ RESTful API 接口
- ✅ 设备状态监控
- ✅ 升级历史记录

### 设备端功能
- ✅ 自动连接和重连机制
- ✅ 文件下载和校验
- ✅ 升级包部署
- ✅ 系统信息上报
- ✅ 路径安全验证

## 🛡️ 安全特性

- CORS 跨域安全配置
- 文件路径注入防护
- MD5 文件完整性校验
- Socket.IO 连接认证
- 环境变量配置管理

## 📊 监控和日志

- 设备在线状态监控
- 升级操作审计日志
- 系统性能指标收集
- 错误日志记录和分析

## 🔄 部署说明

### 生产环境部署

1. **服务端部署**
   ```bash
   cd server-koa
   npm run build    # 如果有构建步骤
   npm start        # 生产环境启动
   ```

2. **设备端部署**
   ```bash
   cd agent-device
   npm install --production
   npm start
   ```

### Docker 部署 (可选)
TODO: 添加 Dockerfile 和 docker-compose.yml

## 🤝 开发指南

### 代码风格
- 使用 ESM 模块格式
- 遵循中文注释规范
- 采用 camelCase 命名约定
- 保持代码简洁和可读性

### 提交规范
- 使用语义化提交消息
- 功能开发使用 feature 分支
- 代码审查后合并到 main 分支

## 📝 更新日志

### v1.0.0 (Current)
- 基础远程升级功能实现
- Socket.IO 实时通信
- 文件上传和下载
- 设备状态管理
- 安全性改进和代码重构

## 🐛 问题反馈

请在 [Issues](https://github.com/zenvor/remote-upgrader/issues) 页面提交问题和建议。

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 👥 贡献者

- [@zenvor](https://github.com/zenvor) - 项目维护者