// 中文注释：加载环境变量配置
import dotenv from 'dotenv'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 中文注释：ESM 导入与 __dirname 兼容处理
import cors from '@koa/cors'
import Router from '@koa/router'
import fs from 'fs-extra'
import Koa from 'koa'
import bodyParser from 'koa-bodyparser'
import serve from 'koa-static'
import { koaSwagger } from 'koa2-swagger-ui'
import { Server } from 'socket.io'
import swaggerSpec from './config/swagger.js'
import { initializeBatchTaskManager } from './controllers/batchController.js'
import { setupSocketHandlers } from './controllers/socketController.js'
import createTimeFormatter from './middleware/timeFormatter.js'
import batchRouter from './routes/batch.js'
import deviceRouter from './routes/devices.js'
import docsRouter from './routes/docs.js'
import packageRouter from './routes/packages.js'
import uploadRouter from './routes/upload.js'
import versionRouter from './routes/versions.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 常量配置
const constants = {
  staticCacheMaxAge: 1000 * 60 * 60 * 24 * 7, // 7天缓存
  bodyParserLimit: '50mb', // 请求体大小限制
  defaultPort: 3000,
  defaultHost: '0.0.0.0'
}

const app = new Koa()
const router = new Router()
const server = createServer(app.callback())

// 配置 Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3001', 'http://127.0.0.1:3001'],
    methods: ['GET', 'POST'],
    credentials: true
  }
})

// 中间件配置
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3001', 'http://127.0.0.1:3001'],
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  })
)

app.use(
  bodyParser({
    enableTypes: ['json', 'form', 'text'],
    formLimit: constants.bodyParserLimit,
    jsonLimit: constants.bodyParserLimit
  })
)

// 统一时间格式化中间件（在路由之前，处理所有响应体中的时间字段）
app.use(createTimeFormatter())

// 静态文件服务中间件 - 服务前端打包后的静态文件
const staticPath = path.join(__dirname, '..', 'public')
app.use(
  serve(staticPath, {
    maxAge: constants.staticCacheMaxAge,
    index: 'index.html',
    gzip: true
  })
)

// 安全头中间件
app.use(async (ctx, next) => {
  // 设置安全相关的 HTTP 头
  ctx.set('X-Content-Type-Options', 'nosniff')
  ctx.set('X-Frame-Options', 'DENY')
  ctx.set('X-XSS-Protection', '1; mode=block')
  ctx.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  // 生产环境下强制 HTTPS
  if (process.env.NODE_ENV === 'production') {
    ctx.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

  await next()
})

// 错误处理中间件
app.use(async (ctx, next) => {
  try {
    await next()
  } catch (error) {
    console.error('请求处理错误:', error)

    // 确定错误状态码
    const status = error.status || error.statusCode || 500
    ctx.status = status

    // 根据环境决定错误信息详细程度
    const isDevelopment = process.env.NODE_ENV !== 'production'
    const errorMessage = isDevelopment
      ? error.message || '内部服务器错误'
      : status < 500
        ? error.message
        : '服务器内部错误'

    ctx.body = {
      success: false,
      error: errorMessage
    }

    // 记录详细错误信息（仅服务端）
    if (status >= 500) {
      console.error('服务器错误详情:', {
        message: error.message,
        stack: error.stack,
        url: ctx.url,
        method: ctx.method,
        ip: ctx.ip
      })
    }
  }
})

// Swagger API 文档路由
app.use(
  koaSwagger({
    routePrefix: '/api-docs',
    swaggerOptions: {
      spec: swaggerSpec,
      explorer: true,
      customCss: `
      .swagger-ui .topbar { 
        background-color: #2c3e50; 
      }
      .swagger-ui .topbar-wrapper .link {
        content: "远程升级系统 API 文档";
      }
    `,
      customSiteTitle: '远程升级系统 API 文档'
    }
  })
)

// JSON 格式的 API 规范
router.get('/swagger.json', (ctx) => {
  ctx.set('Content-Type', 'application/json')
  ctx.body = swaggerSpec
})

// 路由配置
app.use(docsRouter.routes())
app.use(router.routes())
app.use(uploadRouter.routes())
app.use(packageRouter.routes())
app.use(deviceRouter.routes())
app.use(versionRouter.routes())
app.use(batchRouter.routes())

// Socket.IO 连接处理
setupSocketHandlers(io)

// 确保必要目录存在
async function ensureDirectories() {
  const dirs = [
    'config',
    'uploads/packages/frontend',
    'uploads/packages/backend',
    'logs',
    'public' // 静态文件目录
  ]

  try {
    // 并行创建所有目录，提高性能
    const dirPromises = dirs.map(async (dir) => {
      const targetPath = path.join(__dirname, '..', dir)
      await fs.ensureDir(targetPath)
      console.log(`✅ 目录确保存在: ${targetPath}`)
      return targetPath
    })

    await Promise.all(dirPromises)
  } catch (error) {
    console.error('❌ 创建必要目录失败:', error)
    throw error
  }
}

// 启动服务
export async function start() {
  await ensureDirectories()

  // 初始化批量任务管理器
  await initializeBatchTaskManager()

  const port = Number.parseInt(process.env.PORT) || constants.defaultPort
  const host = process.env.HOST || constants.defaultHost

  // 参数验证
  if (port < 1 || port > 65535) {
    throw new Error(`无效的端口号: ${port}`)
  }

  return new Promise((resolve, reject) => {
    server.listen(port, host, (error) => {
      if (error) {
        reject(error)
      } else {
        console.log(`🚀 远程升级系统服务已启动`)
        console.log(`📍 监听地址: ${host}:${port}`)
        console.log(`📖 API文档: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/api-docs`)
        console.log(`🌍 环境: ${process.env.NODE_ENV || 'development'}`)
        resolve({ host, port })
      }
    })
  })
}

// 中文注释：ESM 环境的 main 检测（兼容 PM2）
const argvPath = process.argv[1] && path.resolve(process.argv[1])
const isMain = argvPath && argvPath === fileURLToPath(import.meta.url)

// PM2 下也视为主进程
const isPm2 = !!process.env.pm_id

if (isMain || isPm2) {
  start().catch(console.error)
}

export { app, io, server }
