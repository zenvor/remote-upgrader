# PM2 开机自启动配置指南

配置 PM2 在服务器重启后自动启动应用程序。

## Linux/macOS 系统配置

### 1. 生成开机启动脚本
```bash
pm2 startup
```

### 2. 启动应用服务
```bash
# 启动服务（根据项目选择）
npm run deploy:prod
# 或
pm2 start ecosystem.config.cjs --env production
```

### 3. 检查服务状态
```bash
pm2 list
```

### 4. 保存当前进程配置
```bash
pm2 save
```

### 5. 验证配置
```bash
# 模拟重启测试
pm2 kill
pm2 resurrect
pm2 list

# 检查 systemd 服务
systemctl status pm2-root
systemctl is-enabled pm2-root
```

## Windows 系统配置

### 1. 安装 pm2-windows-startup
```bash
npm install pm2-windows-startup -g
```

### 2. 安装开机启动服务
```bash
pm2-startup install
```

### 3. 启动应用服务
```bash
# 启动服务
pm2 start ecosystem.config.cjs --env production
# 或根据项目配置
npm run deploy:prod
```

### 4. 保存当前进程配置
```bash
pm2 save
```

### 5. 验证配置
```bash
# 模拟重启测试
pm2 kill
pm2 resurrect
pm2 list
```

### Windows 其他方案（备选）

#### 方案2: 使用任务计划程序
1. 创建 `start-pm2.bat`：
```batch
@echo off
cd /d "项目路径"
pm2 resurrect
```
2. 将批处理文件添加到 Windows 任务计划程序，设置为开机启动

#### 方案3: 放入启动文件夹
将启动脚本复制到：
```
C:\Users\%USERNAME%\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup
```

## 常用管理命令

```bash
# 查看状态
pm2 list
pm2 logs

# 更新配置（修改后执行）
pm2 save

# 禁用开机启动（Linux/macOS）
pm2 unstartup systemd

# 禁用开机启动（Windows）
pm2-startup uninstall

# 重新加载
pm2 reload all
```

## 注意事项

- 每次修改 PM2 进程后需要执行 `pm2 save`
- 服务器重启后进程会自动恢复
- 确保应用有足够的文件访问权限