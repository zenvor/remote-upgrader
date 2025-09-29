# PM2 开机自启动配置指南（增强版）

配置 PM2 在服务器重启后自动启动应用程序，兼容 Linux、macOS 和 Windows，并补充用户/路径差异说明。

## Linux/macOS 系统配置

### 1. 生成开机启动脚本（推荐显式指定 systemd 与用户）

```bash
# 以 root 用户为例：
pm2 startup systemd -u root --hp /root

# 普通用户示例：
pm2 startup systemd -u hcx --hp /home/hcx
```

> `pm2 startup` 不加参数时，会自动检测当前用户和 init 系统并生成对应的 `pm2-<user>.service`，但推荐显式指定，避免多用户或 home 目录异常导致的错误。

| 命令                                     | 用户/目录                      | systemd 指定       | 典型生成的 Service 文件  | 适用场景                 |
| ---------------------------------------- | ------------------------------ | ------------------ | ------------------------ | ------------------------ |
| `pm2 startup`                            | 当前 shell 用户、自动检测 home | 自动检测 init 系统 | `pm2-<当前用户>.service` | 单用户快速配置           |
| `pm2 startup systemd -u root --hp /root` | 显式指定 root 用户和 home      | 手动指定 systemd   | `pm2-root.service`       | 多用户/容器/CI，精确控制 |

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

### 4. 保存当前进程配置（非常关键）

```bash
pm2 save
```

> 每次新增/修改 PM2 进程后都需要 `pm2 save`，否则重启后不会恢复。

### 5. 启用并启动 systemd 服务（首次执行）

```bash
systemctl enable pm2-root       # 设置开机自启
systemctl start pm2-root        # 立即启动服务
```

> 如果是普通用户则对应 `pm2-<your-user>.service`。

### 6. 验证配置

```bash
# 模拟重启测试
pm2 kill
pm2 resurrect
pm2 list

# 检查 systemd 服务
systemctl status pm2-root
systemctl is-enabled pm2-root
```

> 如果 `systemctl is-enabled` 显示 enabled 且 `systemctl status` 显示 active (running)，重启系统后就无需再手动 `systemctl start pm2-root`。

### 7. 重启服务器后验证

```bash
reboot
# 重启后
systemctl status pm2-root
pm2 list
```

### 8. 日志轮转建议

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
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
pm2 kill
pm2 resurrect
pm2 list
```

### Windows 其他方案（备选）

#### 方案 2: 使用任务计划程序

1. 创建 `start-pm2.bat`：

```batch
@echo off
cd /d "项目路径"
pm2 resurrect
```

2. 将批处理文件添加到 Windows 任务计划程序，设置为开机启动

#### 方案 3: 放入启动文件夹

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

# 重新加载应用
pm2 reload all
```

## 注意事项

- 每次修改 PM2 进程后需要执行 `pm2 save`
- 服务器重启后进程会自动恢复，无需再次执行 `systemctl start pm2-root`（除非你手动停止了服务）
- 确保应用有足够的文件访问权限，尤其是多用户环境下
- 建议在正式环境显式指定 `systemd`、`-u`、`--hp`，保证生成的 systemd 服务文件正确
- 建议安装日志轮转插件防止日志过大
