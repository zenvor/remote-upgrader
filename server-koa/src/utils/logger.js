// 中文注释：统一日志工具，支持分级控制与全局接管 console
import util from 'node:util'

const LEVELS = ['error', 'warn', 'info', 'debug']
const LEVEL_MAP = LEVELS.reduce((acc, level, index) => {
  acc[level] = index
  return acc
}, {})

const originalConsole = {
  error: console.error.bind(console),
  warn: console.warn.bind(console),
  info: console.info ? console.info.bind(console) : console.log.bind(console),
  log: console.log.bind(console),
  debug: console.debug ? console.debug.bind(console) : console.log.bind(console)
}

const resolveInitialLevel = () => {
  const envLevel =
    (process.env.SERVER_LOG_LEVEL || process.env.LOG_LEVEL || 'info').toLowerCase()
  return LEVEL_MAP[envLevel] ?? LEVEL_MAP.info
}

let currentLevel = resolveInitialLevel()

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

// 中文注释：格式化为更易读的本地时间字符串
const formatTimestamp = () => {
  const date = new Date()
  const pad = (value, length = 2) => String(value).padStart(length, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

// 中文注释：为不同级别设置终端颜色
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

const emit = (level, parts) => {
  if (LEVEL_MAP[level] > currentLevel) {
    return
  }

  const message = applyColor(level, formatMessage(level, parts))

  switch (level) {
    case 'error':
      originalConsole.error(message)
      break
    case 'warn':
      originalConsole.warn(message)
      break
    case 'debug':
      originalConsole.debug(message)
      break
    default:
      originalConsole.log(message)
  }
}

const logger = {
  // 中文注释：允许运行期间调整日志级别
  setLevel(level) {
    const normalized = (level || '').toLowerCase()
    if (LEVEL_MAP[normalized] !== undefined) {
      currentLevel = LEVEL_MAP[normalized]
      emit('info', [`日志级别已调整为 ${normalized}`])
    } else {
      emit('warn', [`无法识别的日志级别: ${level}`])
    }
  },
  error(...args) {
    emit('error', args)
  },
  warn(...args) {
    emit('warn', args)
  },
  info(...args) {
    emit('info', args)
  },
  debug(...args) {
    emit('debug', args)
  }
}

export const patchConsole = () => {
  console.error = (...args) => logger.error(...args)
  console.warn = (...args) => logger.warn(...args)
  console.info = (...args) => logger.info(...args)
  console.log = (...args) => logger.info(...args)
  console.debug = (...args) => logger.debug(...args)
}

export default logger
