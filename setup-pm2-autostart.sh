#!/bin/bash

# PM2 Linux/macOS 开机自启一键脚本
# 使用方式: chmod +x setup-pm2-autostart.sh && ./setup-pm2-autostart.sh

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo " PM2 Linux/macOS 开机自启 一键脚本"
echo "========================================"

# 获取脚本所在目录（项目根目录）
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
echo "当前项目目录: $SCRIPT_DIR"
cd "$SCRIPT_DIR"

# 检查是否为 root 用户（仅 Linux 需要）
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    if [[ $EUID -ne 0 ]]; then
        echo -e "${YELLOW}⚠ 当前不是 root 权限，某些操作可能失败${NC}"
        echo "建议使用 sudo 运行此脚本: sudo ./setup-pm2-autostart.sh"
        read -p "是否继续? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
fi

# 检查 Node.js 是否存在
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ 未检测到 Node.js，请先安装 Node.js${NC}"
    echo "macOS: brew install node"
    echo "Ubuntu/Debian: sudo apt-get install nodejs npm"
    exit 1
fi
echo -e "${GREEN}✅ 已检测到 Node.js: $(node -v)${NC}"

# 检查 npm 是否存在
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ 未检测到 npm，请检查 Node.js 安装${NC}"
    exit 1
fi
echo -e "${GREEN}✅ 已检测到 npm: $(npm -v)${NC}"

# 检查和安装 pm2
if ! command -v pm2 &> /dev/null; then
    echo "未检测到 pm2，正在安装..."
    if [[ $EUID -eq 0 ]]; then
        npm install -g pm2
    else
        sudo npm install -g pm2
    fi
else
    echo -e "${GREEN}✅ 已检测到 pm2: $(pm2 -v)${NC}"
fi

# 停止现有的 PM2 进程（如果有的话）
echo "正在停止已有的 PM2 进程..."
pm2 kill 2>/dev/null || true

# 启动服务
echo "正在启动项目服务: npm run deploy:prod"
npm run deploy:prod

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ npm run deploy:prod 执行失败，请检查 package.json 脚本${NC}"
    exit 1
fi

# 保存 pm2 列表
echo "正在保存 PM2 进程列表..."
pm2 save

# 配置开机自启
echo "正在配置 PM2 开机自启..."
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux 使用 systemd
    if [[ $EUID -eq 0 ]]; then
        pm2 startup systemd -u $SUDO_USER --hp /home/$SUDO_USER
    else
        sudo pm2 startup systemd -u $USER --hp $HOME
    fi
elif [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS 使用 launchd
    pm2 startup launchd -u $USER --hp $HOME
fi

# 再次保存
pm2 save

echo ""
echo "========================================"
echo -e "${GREEN}✅ PM2 开机自启配置完成${NC}"
echo "========================================"
echo ""
echo "验证方式："
echo "  pm2 list              # 查看进程列表"
echo "  pm2 logs admin-server # 查看日志"
echo "  pm2 status            # 查看状态"
echo ""
echo "测试开机自启（重启系统后自动启动）："
echo "  pm2 kill              # 停止进程"
echo "  # 重启系统"
echo "  pm2 list              # 验证进程是否自动启动"
echo ""
echo "手动启停："
echo "  pm2 start admin-server   # 启动"
echo "  pm2 stop admin-server    # 停止"
echo "  pm2 restart admin-server # 重启"
echo "========================================"
