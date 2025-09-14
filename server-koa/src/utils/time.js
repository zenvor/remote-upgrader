// 中文注释：统一的时间格式化工具（基于 dayjs）
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * 将任意输入转为 dayjs 对象（如果可能）
 * 支持：Date | ISO 字符串 | 时间戳（毫秒/秒）
 */
function toDayjs(value) {
  if (value == null) return null;
  if (value instanceof Date) return dayjs(value);
  if (typeof value === 'number') {
    // 处理秒级时间戳
    const isSeconds = value < 1e12;
    return isSeconds ? dayjs(value * 1000) : dayjs(value);
  }
  if (typeof value === 'string') {
    // 优先用 dayjs 直接解析，失败再尝试 Date 兜底
    const d = dayjs(value);
    return d.isValid() ? d : (dayjs(new Date(value)).isValid() ? dayjs(new Date(value)) : null);
  }
  return null;
}

/**
 * 格式化为默认字符串（YYYY-MM-DD HH:mm:ss，Asia/Shanghai）
 */
export function formatDate(value, {
  timeZone = 'Asia/Shanghai',
  pattern = 'YYYY-MM-DD HH:mm:ss'
} = {}) {
  const d = toDayjs(value);
  if (!d || !d.isValid()) return value; // 非日期输入原样返回
  return d.tz(timeZone).format(pattern);
}

/**
 * 深度格式化对象/数组中的时间字段
 * - 规则：
 *   1) 值可被 dayjs 识别；
 *   2) 或键名以 at/time/timestamp/date 结尾；
 * - 避免处理可读流、Buffer 等
 */
export function formatTimeFieldsDeep(payload, options = {}) {
  if (!payload || typeof payload !== 'object') return payload;
  if (typeof payload.pipe === 'function' || Buffer.isBuffer(payload)) return payload;

  const seen = new WeakSet();
  const shouldFormatByKey = (key) => typeof key === 'string' && /(At|at|Time|time|Timestamp|timestamp|Date|date|Updated|updated)$/.test(key);

  const walk = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    if (seen.has(obj)) return obj;
    seen.add(obj);

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        const v = obj[i];
        const d = toDayjs(v);
        if (d && d.isValid()) {
          obj[i] = formatDate(d.toDate(), options);
        } else if (v && typeof v === 'object') {
          walk(v);
        }
      }
      return obj;
    }

    for (const [k, v] of Object.entries(obj)) {
      const d = toDayjs(v);
      if ((d && d.isValid() && v instanceof Date) || shouldFormatByKey(k)) {
        const tryD = d && d.isValid() ? d : toDayjs(v);
        if (tryD && tryD.isValid()) obj[k] = formatDate(tryD.toDate(), options);
      } else if (v && typeof v === 'object') {
        walk(v);
      }
    }
    return obj;
  };

  return walk(payload);
}

export default { formatDate, formatTimeFieldsDeep };
