@echo off
setlocal enabledelayedexpansion
title PM2 Windows 开机自启一键配置

echo ========================================
echo  PM2 Windows 开机自启 一键脚本
echo ========================================

:: 切换到当前脚本所在目录（项目根目录）
cd /d %~dp0
echo 当前项目目录: %cd%

:: 检查是否有管理员权限
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [91m⚠ 当前不是管理员权限，请右键以管理员身份运行！[0m
    pause
    exit /b
)

:: 检查 Node 是否存在
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [91m❌ 未检测到 Node.js，请先安装 Node.js[0m
    pause
    exit /b
)
echo [92m✅ 已检测到 Node.js[0m

:: 检查 npm 是否存在
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [91m❌ 未检测到 npm，请检查 Node.js 安装[0m
    pause
    exit /b
)
echo [92m✅ 已检测到 npm[0m

:: 检查和安装 pm2
where pm2 >nul 2>&1
if %errorlevel% neq 0 (
    echo 未检测到 pm2，正在安装...
    npm install -g pm2
    if !errorlevel! neq 0 (
        echo [91m❌ pm2 安装失败[0m
        pause
        exit /b
    )
) else (
    echo [92m✅ 已检测到 pm2[0m
)

:: 停止现有的 PM2 进程
echo 正在停止已有的 PM2 进程...
pm2 kill >nul 2>&1

:: 启动服务
echo 正在启动项目服务: npm run deploy:prod
npm run deploy:prod

if !errorlevel! neq 0 (
    echo [91m❌ npm run deploy:prod 执行失败，请检查 package.json 脚本[0m
    pause
    exit /b
)

:: 保存 pm2 列表
echo 正在保存 PM2 进程列表...
pm2 save

:: 配置开机启动服务
echo 正在配置 PM2 开机自启服务...
pm2 install pm2-auto-pull >nul 2>&1

:: 生成 Windows 开机启动脚本
echo 正在生成 Windows 开机启动脚本...
for /f "tokens=*" %%i in ('pm2 startup windows-startup') do set "startup_cmd=%%i"
%startup_cmd% >nul 2>&1

echo.
echo ========================================
echo [92m✅ PM2 开机自启配置完成[0m
echo ========================================
echo.
echo 验证方式：
echo   pm2 list              - 查看进程列表
echo   pm2 logs admin-server - 查看日志
echo   pm2 status            - 查看状态
echo.
echo 测试开机自启（重启系统后自动启动）：
echo   pm2 kill              - 停止进程
echo   [重启系统]
echo   pm2 list              - 验证进程是否自动启动
echo.
echo 手动启停：
echo   pm2 start admin-server   - 启动
echo   pm2 stop admin-server    - 停止
echo   pm2 restart admin-server - 重启
echo ========================================
echo.

pause
