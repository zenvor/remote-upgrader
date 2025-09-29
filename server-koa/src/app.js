// 中文注释：应用入口，负责初始化 Koa 服务、Socket.IO 以及静态资源路由
import dotenv from 'dotenv'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import cors from '@koa/cors'
import Router from '@koa/router'
import fs from 'fs-extra'
import Koa from 'koa'
import bodyParser from 'koa-bodyparser'
import serve from 'koa-static'
import { koaSwagger } from 'koa2-swagger-ui'
import { Server as SocketIOServer } from 'socket.io'

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
import logger, { patchConsole } from './utils/logger.js'

// 中文注释：加载环境变量并修补控制台输出
dotenv.config()
patchConsole()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 中文注释：核心常量统一管理，便于集中调整
const CONSTANTS = {
  defaultPort: 3000,
  defaultHost: '0.0.0.0',
  bodyLimit: '50mb',
  staticCacheMaxAge: 1000 * 60 * 60 * 24 * 7 // 7 天缓存
}

const PATHS = {
  root: path.join(__dirname, '..'),
  public: path.join(__dirname, '..', 'public'),
  web: path.join(__dirname, '..', 'public', 'web'),
  webAdmin: path.join(__dirname, '..', 'public', 'webadmin')
}

// 中文注释：解析允许跨域的源，支持多值配置
function resolveAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS
  if (!raw || typeof raw !== 'string') {
    return ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001']
  }
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

// 中文注释：创建 Koa 实例与 HTTP/Socket 服务
const app = new Koa()
const router = new Router()
const server = createServer(app.callback())
const io = new SocketIOServer(server, {
  cors: {
    origin: resolveAllowedOrigins(),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
  }
})

// 中文注释：将 Socket.IO 引用挂载到应用上下文，方便在控制器中访问
app.context.io = io

// 中文注释：通用错误处理与请求日志
app.use(async (ctx, next) => {
  const startTime = Date.now()
  try {
    await next()
  } catch (error) {
    const duration = Date.now() - startTime
    logger.error('HTTP 请求异常', {
      method: ctx.method,
      url: ctx.url,
      status: error.status || 500,
      duration,
      error: error.stack || error.message
    })

    ctx.status = error.status || 500
    ctx.body = {
      success: false,
      message: process.env.NODE_ENV === 'production' ? '服务器内部错误' : error.message
    }
    return
  }

  const duration = Date.now() - startTime
  logger.info('HTTP 请求', {
    method: ctx.method,
    url: ctx.url,
    status: ctx.status,
    duration
  })

  if (ctx.status === 404 && ctx.body == null) {
    ctx.body = {
      success: false,
      message: '接口不存在'
    }
  }
})

// 中文注释：注册通用中间件（CORS、BodyParser、时间格式化）
app.use(
  cors({
    origin: resolveAllowedOrigins(),
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  })
)

app.use(
  bodyParser({
    enableTypes: ['json', 'form', 'text'],
    jsonLimit: CONSTANTS.bodyLimit,
    formLimit: CONSTANTS.bodyLimit
  })
)

app.use(createTimeFormatter())

// 中文注释：统一 SPA 静态文件处理中间件
function createSpaMiddleware(basePath, directory) {
  const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath
  const baseWithSlash = `${normalizedBase}/`

  return async (ctx, next) => {
    if (ctx.path === normalizedBase || ctx.path.startsWith(baseWithSlash)) {
      const relative = ctx.path === normalizedBase ? '' : ctx.path.slice(baseWithSlash.length)
     const candidate = relative || 'index.html'
     const absoluteCandidate = path.join(directory, candidate)
     const isAssetRequest = candidate.includes('.')
      let finalPath = absoluteCandidate

      if (isAssetRequest) {
        const assetExists = await fs.pathExists(absoluteCandidate)
        if (!assetExists) {
          logger.warn('静态资源缺失', {
            basePath: normalizedBase,
            requestPath: ctx.path,
            candidate
          })
          ctx.status = 404
          ctx.body = 'File not found'
          return
        }
      } else {
        finalPath = path.join(directory, 'index.html')
      }

      try {
        const content = await fs.readFile(finalPath)
        ctx.type = resolveMimeType(finalPath)
        ctx.body = content
      } catch (error) {
        if (error.code === 'ENOENT') {
          ctx.status = 404
          ctx.body = 'File not found'
        } else {
          throw error
        }
      }
      return
    }

    await next()
  }
}

// 中文注释：基础静态资源服务（公共资源和 SPA 项目）
app.use(createSpaMiddleware('/web', PATHS.web))
app.use(createSpaMiddleware('/webadmin', PATHS.webAdmin))
app.use(
  serve(PATHS.public, {
    maxAge: CONSTANTS.staticCacheMaxAge,
    index: false,
    gzip: true
  })
)

// 中文注释：Swagger UI 与 swagger.json 输出
app.use(
  koaSwagger({
    routePrefix: '/api-docs',
    swaggerOptions: {
      spec: swaggerSpec,
      explorer: true,
      customSiteTitle: '远程升级系统 API 文档'
    }
  })
)

router.get('/swagger.json', (ctx) => {
  ctx.set('Content-Type', 'application/json')
  ctx.body = swaggerSpec
})

// 中文注释：健康检查接口，供运维与监控使用
router.get('/health', (ctx) => {
  ctx.body = {
    success: true,
    message: 'OK',
    time: new Date().toISOString()
  }
})

// 中文注释：注册业务路由
const businessRouters = [
  docsRouter,
  uploadRouter,
  packageRouter,
  deviceRouter,
  versionRouter,
  batchRouter
]

businessRouters.forEach((businessRouter) => {
  app.use(businessRouter.routes())
  app.use(businessRouter.allowedMethods())
})

app.use(router.routes())
app.use(router.allowedMethods())

// 中文注释：绑定 Socket.IO 事件
setupSocketHandlers(io)

// 中文注释：启动服务前确保必要目录存在
async function ensureDirectories() {
  const directories = [
    'config',
    'logs',
    'uploads/packages/frontend',
    'uploads/packages/backend',
    'public',
    'public/web',
    'public/webadmin'
  ]

  await Promise.all(
    directories.map(async (relativePath) => {
      const absolutePath = path.join(PATHS.root, relativePath)
      await fs.ensureDir(absolutePath)
      logger.debug('已确保目录存在', { path: absolutePath })
      return absolutePath
    })
  )
}

/**
 * 启动 Koa 服务
 * @returns {Promise<{host: string, port: number}>}
 */
export async function start() {
  await ensureDirectories()
  await initializeBatchTaskManager()

  const port = Number.parseInt(process.env.PORT, 10) || CONSTANTS.defaultPort
  const host = process.env.HOST || CONSTANTS.defaultHost

  if (Number.isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`无效的端口号: ${port}`)
  }

  return new Promise((resolve, reject) => {
    server.listen(port, host, (error) => {
      if (error) {
        reject(error)
        return
      }

      logger.info('远程升级系统服务已启动', {
        host,
        port,
        env: process.env.NODE_ENV || 'development'
      })

      logger.info('API 文档地址', {
        url: `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/api-docs`
      })

      resolve({ host, port })
    })
  })
}

// 中文注释：辅助函数，根据文件扩展名推断 MIME 类型
function resolveMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  switch (extension) {
    case '.html':
      return 'text/html'
    case '.js':
      return 'application/javascript'
    case '.css':
      return 'text/css'
    case '.json':
      return 'application/json'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.svg':
      return 'image/svg+xml'
    case '.ico':
      return 'image/x-icon'
    default:
      return 'application/octet-stream'
  }
}

// 中文注释：ESM 环境下的入口函数检测（兼容 PM2 场景）
const argvPath = process.argv[1] ? path.resolve(process.argv[1]) : null
const isMain = argvPath === __filename
const isPm2 = Boolean(process.env.pm_id)

if (isMain || isPm2) {
  start().catch((error) => {
    logger.error('服务启动失败', error)
  })
}

export { app, io, server }
