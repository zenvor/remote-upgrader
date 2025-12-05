# 在国产 Linux 上以 root 用户离线安装 fnm 并通过国内镜像安装 Node.js（压缩包在 /home/hcx 示例版）

## 1. 前提条件

- 目标机器（国产 Linux，如 UOS/麒麟等）无法顺畅访问 GitHub 或 Vercel。
- 你有一台能上网的电脑可以先下载 fnm 的二进制包和 Node.js 镜像。
- 以下步骤全部在 **root 用户** 下执行，保证 Node.js 安装在 root 用户环境中。
- 本文档示例中，压缩包在 `/home/hcx/fnm-linux.zip`，可以按需替换为你自己的路径。

---

## 2. 下载 fnm 二进制包（在能上网的电脑上）

1. 打开浏览器或用 curl 下载 fnm 的 Linux 二进制包（使用加速地址）：

   ```
   https://github.com/Schniz/fnm/releases/download/v1.38.1/fnm-linux.zip
   ```

2. 下载完成后得到 `fnm-linux.zip` 文件。
3. 把该文件通过向日葵、scp 或 U 盘传到目标机器，例如放到 `/home/hcx/fnm-linux.zip`。

---

## 3. 在 root 用户下安装 fnm（压缩包在 /home/hcx 示例）

切换到 root 用户（如果还没在 root 下）：
```bash
sudo -i   # 或 su -
```

然后执行：
```bash
# 切换到压缩包所在目录
cd /home/hcx

# 解压并赋予执行权限
unzip fnm-linux.zip
chmod +x fnm

# 放到 root 用户的 bin 目录
mkdir -p /root/.local/bin
mv fnm /root/.local/bin/

# 加入 PATH 并立即生效
echo 'export PATH="/root/.local/bin:$PATH"' >> /root/.bashrc
source /root/.bashrc

# 验证 fnm 是否可用
fnm --version
```

---

## 4. 配置国内 Node.js 镜像（root 用户环境）

在 root 的 shell 中执行并写入 `/root/.bashrc`：

```bash
# npmmirror 镜像
echo 'export FNM_NODE_DIST_MIRROR=https://npmmirror.com/mirrors/node' >> /root/.bashrc

# 或清华镜像
# echo 'export FNM_NODE_DIST_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/nodejs-release/' >> /root/.bashrc

source /root/.bashrc
```

---

## 5. 配置 fnm 自动加载 Node.js 版本（root 用户环境）

fnm 安装 Node 后，需要把 `fnm env` 输出的初始化脚本加入 `/root/.bashrc`，否则 `node -v` 会提示“无此命令” ：

```bash
echo 'eval "$(fnm env)"' >> /root/.bashrc
source /root/.bashrc
```

这一步只需要做一次，之后每次以 root 登录 shell fnm 就会自动把 Node.js 加入 PATH。

---

## 6. 使用 fnm 安装和切换 Node.js（root 用户环境）

```bash
# 安装 Node.js 18 LTS
fnm install 18
fnm default 18

# 安装 Node.js 22
fnm install 22
fnm default 22

# 查看版本
node -v
npm -v
```

---

## 7. 常见问题与解决

- **环境变量只在当前窗口有效？**  
  通过 `export` 手动输入只对当前会话有效。写入 `/root/.bashrc` 才能永久生效。
- **`node -v` 还是老版本？**  
  重开终端或 `source /root/.bashrc`，并 `hash -r` 刷新命令缓存；确保 `/root/.local/bin` 在 PATH 前面；**务必加上 `eval "$(fnm env)"`**。
- **下载 node 版本失败**  
  确认 `FNM_NODE_DIST_MIRROR` 设置为 npmmirror 或清华镜像。

---

## 8. 总结流程图（root 用户环境）

1. **有网电脑下载** → `fnm-linux.zip`  
2. **传到目标机（任意目录，例如 /home/hcx/）**  
3. **root 用户解压并移动 fnm 到 /root/.local/bin**  
4. **写入国内镜像** → `/root/.bashrc`  
5. **写入 eval "$(fnm env)"** → `/root/.bashrc`  
6. **fnm install <版本号>** → 安装并切换 Node  

---

✅ 按照本指南，你就能在国产 Linux 上以 **root 用户** 顺利离线安装 fnm，并通过国内镜像装任意版本的 Node.js（18/20/22）。

