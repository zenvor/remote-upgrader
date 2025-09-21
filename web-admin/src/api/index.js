/**
 * API 统一入口文件
 * 导出所有 API 模块
 */

// 设备管理 API
export * as deviceApi from './modules/deviceApi.js'

// 包管理 API
export * as packageApi from './modules/packageApi.js'

// 上传管理 API
export * as uploadApi from './modules/uploadApi.js'

// 也可以分别导入使用
export { default as request } from './request.js'
export { BASE_URL } from './config.js'
