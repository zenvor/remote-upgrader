# 远程升级系统 - 前端管理界面

基于 Vue 3 + Vite + TailwindCSS + PrimeVue 构建的现代化远程升级管理界面。

## 🚀 快速开始

### 环境要求

- Node.js >= 16
- npm >= 7

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

前端将在 http://localhost:5174 启动

### 构建生产版本

```bash
npm run build
```

### 预览生产版本

```bash
npm run preview
```

## 📋 功能特性

### 1. 包管理（集成上传） (`/packages`)

- **直接上传**：使用 multipart/form-data 一次性上传包文件
- **MD5校验**：服务端计算文件级 MD5 校验
- **进度显示**：展示上传进度与剩余时间
- **包列表管理**：查看所有已上传的升级包
- **包详情查看**：显示包的完整性信息、Manifest内容
- **部署历史**：查看每个包的部署记录
- **一键部署**：选择目标设备进行包部署
- **存储统计**：显示前端/后端包数量和总存储大小
- **部署目录配置**：部署时可指定设备端目标目录（默认前端 `/opt/frontend`，后端 `/opt/backend`）

### 2. 设备管理界面 (`/devices`)

- **设备状态监控**：实时显示设备在线/离线状态
- **版本信息展示**：显示前端/后端当前部署版本
- **批量操作**：支持批量升级、回滚、重启
- **实时日志**：查看设备实时运行日志
- **设备统计**：在线/离线/升级中设备数量统计

<!-- 包管理已与上传合并，故删除单独条目 -->

## 🛠 技术栈

- **Vue 3**：渐进式JavaScript框架
- **Vite**：现代化构建工具
- **Vue Router**：官方路由管理器
- **Pinia**：Vue状态管理库
- **PrimeVue**：丰富的UI组件库
- **TailwindCSS**：实用优先的CSS框架
- **Axios**：HTTP客户端
// 已移除 Socket.IO，统一通过 HTTP 接口刷新数据

## 📁 项目结构

```
web-admin/
├── src/
│   ├── views/                    # 页面组件
│   │   ├── DevicesView.vue      # 设备管理页面
│   │   └── PackagesView.vue     # 包管理 + 上传 页面
│   ├── composables/             # 组合式函数
│   │   ├── useUpload.js         # 上传功能
│   │   ├── useDevices.js        # 设备管理
│   │   └── usePackages.js       # 包管理
│   ├── components/              # 可复用组件
│   ├── App.vue                  # 根组件
│   ├── main.js                  # 应用入口
│   └── style.css                # 样式文件
├── package.json
└── vite.config.js
```

## 🔧 配置

### API地址配置

默认API地址为 `http://localhost:3000`，可在以下文件中修改：

- `src/composables/useUpload.js`
- `src/composables/useDevices.js`  
- `src/composables/usePackages.js`

### PrimeVue主题

使用Aura主题，支持暗黑模式。可在 `src/main.js` 中修改主题配置。

### TailwindCSS

已集成TailwindCSS，支持实用优先的样式开发。

## 🌐 API集成

前端与后端Koa服务进行交互，主要API包括：

### 上传 API
- `POST /upload/direct` - 直接上传（表单字段：file, project）

### 设备管理  
- `GET /devices` - 获取设备列表
- `POST /devices/:id/command` - 发送设备命令

### 包管理
- `GET /packages` - 获取包列表
- `DELETE /packages/:project/:fileName` - 删除包
- `POST /dispatch/init` - 初始化包分发

### 设备升级命令（前端发送到后端，再由后端转发到设备）
- `POST /devices/:id/command`，命令为 `cmd:upgrade`，数据结构：
  - `project`: `frontend` | `backend`
  - `fileName`: 升级包文件名
  - `version`: 版本（可选）
  - `deployPath`: 设备端部署目录（可选；若不传，则设备端可使用默认值或拒绝执行）

### WebSocket事件
- `device:status` - 设备状态变化
- `device:online/offline` - 设备上下线
- `upgrade:progress` - 升级进度更新

## 🎨 界面特性

- **响应式设计**：适配桌面和移动端
- **现代化UI**：基于PrimeVue的精美界面
- **实时更新**：WebSocket实时数据同步
- **国际化支持**：中文界面，易于本地化
- **暗黑模式**：支持明暗主题切换

## 🔍 开发说明

### 添加新功能

1. 在 `src/composables/` 中添加业务逻辑
2. 在 `src/views/` 中创建页面组件
3. 在 `src/main.js` 中配置路由

### 样式开发

- 优先使用TailwindCSS工具类
- PrimeVue组件提供基础样式
- 自定义样式写在组件的 `<style>` 区块

### 状态管理

使用Pinia进行全局状态管理，各功能模块使用组合式函数封装。

## 🚨 注意事项

1. **跨域配置**：开发环境需要配置CORS
2. **文件大小限制**：受浏览器内存限制，建议单文件不超过500MB
3. **网络稳定性**：大文件上传对网络稳定性有一定要求
4. **浏览器兼容性**：支持现代浏览器，不支持IE

## 📞 技术支持

- 查看浏览器控制台获取详细错误信息
- 确保后端Koa服务正常运行
- 检查网络连接和API地址配置

---

> 🎯 这是一个功能完整的远程升级系统前端管理界面，提供了直观友好的用户体验。
