// 中文注释：简单日志工具，支持按环境变量控制日志级别
import util from 'node:util'

const LEVELS = ['error', 'warn', 'info', 'debug']
const LEVEL_MAP = LEVELS.reduce((acc, level, index) => {
  acc[level] = index
  return acc
}, {})

// 中文注释：读取日志级别，默认为 info
let currentLevel = (() => {
  const envLevel = (process.env.AGENT_LOG_LEVEL || 'info').toLowerCase()
  return LEVEL_MAP[envLevel] ?? LEVEL_MAP.info
})()

const serialize = (value) => {
  if (typeof value === 'string') {
    return value
  }
  try {
    return util.inspect(value, { depth: 4, colors: false, breakLength: Infinity })
  } catch (error) {
    return String(value)
  }
}

// 中文注释：格式化本地时间，避免难读的 ISO 字符串
const formatTimestamp = () => {
  const date = new Date()
  const pad = (value, length = 2) => String(value).padStart(length, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

// 中文注释：不同日志级别使用不同的终端颜色
const LEVEL_COLORS = {
  error: '\x1b[31m',
  warn: '\x1b[33m',
  info: '\x1b[36m',
  debug: '\x1b[90m'
}

const RESET_COLOR = '\x1b[0m'

const formatMessage = (level, parts) => {
  const timestamp = formatTimestamp()
  const payload = parts.map(serialize).join(' ')
  return `[${timestamp}] [${level.toUpperCase()}] ${payload}`
}

const applyColor = (level, message) => {
  const color = LEVEL_COLORS[level]
  return color ? `${color}${message}${RESET_COLOR}` : message
}

const coreLog = (level, parts) => {
  if (LEVEL_MAP[level] > currentLevel) {
    return
  }

  const message = applyColor(level, formatMessage(level, parts))

  switch (level) {
    case 'error':
      console.error(message)
      break
    case 'warn':
      console.warn(message)
      break
    case 'info':
      console.log(message)
      break
    default:
      console.debug(message)
  }
}

const logger = {
  // 中文注释：允许运行时调整日志级别
  setLevel(level) {
    const normalized = (level || '').toLowerCase()
    if (LEVEL_MAP[normalized] !== undefined) {
      currentLevel = LEVEL_MAP[normalized]
      coreLog('info', [`日志级别已调整为 ${normalized}`])
    } else {
      coreLog('warn', [`无法识别的日志级别: ${level}`])
    }
  },
  error(...args) {
    coreLog('error', args)
  },
  warn(...args) {
    coreLog('warn', args)
  },
  info(...args) {
    coreLog('info', args)
  },
  debug(...args) {
    coreLog('debug', args)
  }
}

export default logger
