// 中文注释：ESM 导入与 __dirname 兼容处理
import Koa from 'koa';
import Router from '@koa/router';
import cors from '@koa/cors';
import bodyParser from 'koa-bodyparser';
import { createServer } from 'http';
import { Server } from 'socket.io';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { koaSwagger } from 'koa2-swagger-ui';
import createTimeFormatter from './middleware/timeFormatter.js';
import swaggerSpec from './config/swagger.js';

import uploadRouter from './routes/upload.js';
import packageRouter from './routes/packages.js';
import deviceRouter from './routes/devices.js';
import docsRouter from './routes/docs.js';
import { setupSocketHandlers } from './controllers/socketController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = new Koa();
const router = new Router();
const server = createServer(app.callback());

// 配置 Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3001', 'http://127.0.0.1:3001'],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// 中间件配置
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3001', 'http://127.0.0.1:3001'],
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));


app.use(bodyParser({
  enableTypes: ['json', 'form', 'text'],
  formLimit: '50mb',
  jsonLimit: '50mb'
}));

// 统一时间格式化中间件（在路由之前，处理所有响应体中的时间字段）
app.use(createTimeFormatter());

// 错误处理中间件
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error('请求处理错误:', err);
    ctx.status = err.status || 500;
    ctx.body = {
      success: false,
      error: err.message || '内部服务器错误'
    };
  }
});

// Swagger API 文档路由
app.use(koaSwagger({
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
    customSiteTitle: "远程升级系统 API 文档"
  }
}));

// JSON 格式的 API 规范
router.get('/swagger.json', (ctx) => {
  ctx.set('Content-Type', 'application/json');
  ctx.body = swaggerSpec;
});

// 路由配置
app.use(docsRouter.routes());
app.use(router.routes());
app.use(uploadRouter.routes());
app.use(packageRouter.routes());
app.use(deviceRouter.routes());

// Socket.IO 连接处理
setupSocketHandlers(io);

// 确保必要目录存在
async function ensureDirectories() {
  const dirs = [
    'uploads/packages/frontend',
    'uploads/packages/backend',
    'manifests/frontend',
    'manifests/backend',
    'logs'
  ];
  
  for (const dir of dirs) {
    await fs.ensureDir(path.join(__dirname, '..', dir));
  }
}

// 启动服务
export async function start() {
  await ensureDirectories();
  
  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    console.log(`远程升级系统服务已启动，端口: ${port}`);
  });
}

// 中文注释：ESM 环境的 main 检测
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  start().catch(console.error);
}

export { app, io, server };
