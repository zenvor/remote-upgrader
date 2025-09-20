// 中文注释：统一响应时间字段格式化中间件
import { formatTimeFieldsDeep } from '../utils/time.js'

/**
 * 统一格式化返回给前端的时间字段
 * - 默认时区：Asia/Shanghai
 * - 默认格式：YYYY-MM-DD HH:mm:ss
 * - 仅处理 JSON 数据（对象/数组），跳过流/Buffer
 */
export default function createTimeFormatter(options = {}) {
  const {
    timeZone = process.env.TIMEZONE || 'Asia/Shanghai',
    pattern = process.env.TIME_FORMAT || 'YYYY-MM-DD HH:mm:ss'
  } = options

  return async (ctx, next) => {
    await next()

    // 仅处理 2xx/3xx 的 JSON 类响应
    const { body } = ctx
    if (!body || typeof body !== 'object') return
    if (typeof body.pipe === 'function' || Buffer.isBuffer(body)) return // 跳过流与 Buffer

    try {
      formatTimeFieldsDeep(body, { timeZone, pattern })
      ctx.body = body
    } catch (error) {
      // 避免格式化影响主流程
      console.warn('时间格式化中间件警告:', error.message)
    }
  }
}
