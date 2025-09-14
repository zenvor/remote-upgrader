// 中文注释：ESM 导入
import Router from '@koa/router';
import swaggerSpec from '../config/swagger.js';

const router = new Router();

/**
 * API 文档主页
 */
router.get('/', (ctx) => {
  ctx.body = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>远程升级系统 API</title>
        <style>
            body { 
                font-family: Arial, sans-serif; 
                max-width: 800px; 
                margin: 0 auto; 
                padding: 2rem;
                background-color: #f5f5f5;
            }
            .container {
                background: white;
                padding: 2rem;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            h1 { 
                color: #2c3e50; 
                border-bottom: 2px solid #3498db;
                padding-bottom: 0.5rem;
            }
            .link-box {
                background: #ecf0f1;
                padding: 1rem;
                border-radius: 4px;
                margin: 1rem 0;
            }
            a { 
                color: #3498db; 
                text-decoration: none;
                font-weight: bold;
            }
            a:hover { 
                text-decoration: underline; 
            }
            .description {
                color: #7f8c8d;
                margin-bottom: 2rem;
            }
            .features {
                margin: 2rem 0;
            }
            .features ul {
                list-style-type: none;
                padding: 0;
            }
            .features li {
                background: #e8f5e8;
                margin: 0.5rem 0;
                padding: 0.5rem 1rem;
                border-left: 4px solid #27ae60;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>远程升级系统 API</h1>
            
            <p class="description">
                支持前后端分开打包的远程升级系统，提供直接上传、设备管理等功能
            </p>
            
            <div class="features">
                <h3>核心功能</h3>
                <ul>
                    <li>✅ 直接上传（表单）</li>
                    <li>✅ 文件完整性校验（MD5）</li>
                    <li>✅ 前端/后端独立包管理</li>
                    <li>✅ 设备连接与状态管理</li>
                    <li>✅ 实时命令推送（Socket.IO）</li>
                </ul>
            </div>
            
            <div class="link-box">
                <h3>📚 API 文档</h3>
                <p><a href="/api-docs">Swagger UI 交互式文档</a> - 在线测试 API</p>
                <p><a href="/swagger.json">OpenAPI 3.1.1 规范文件</a> - JSON 格式</p>
            </div>
            
            <div class="link-box">
                <h3>🚀 快速开始</h3>
                <p><strong>1. 上传包:</strong> POST /upload/direct （表单字段：file, project）</p>
                <p><strong>2. 管理包:</strong> GET /packages （查看）｜ DELETE /packages/:project/:fileName （删除）</p>
                <p><strong>3. 设备管理:</strong> GET /devices （列表）｜ POST /devices/:deviceId/command （发送命令）</p>
            </div>
            
            <div class="link-box">
                <h3>📋 API 分组</h3>
                <p><strong>Upload:</strong> 上传管理</p>
                <p><strong>Packages:</strong> 包文件管理</p>
                <p><strong>Devices:</strong> 设备连接管理</p>
            </div>
        </div>
    </body>
    </html>
  `;
});

export default router;
