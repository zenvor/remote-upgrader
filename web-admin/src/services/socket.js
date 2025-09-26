/**
 * Socket.IO 客户端服务
 * 用于实时通信和进度更新
 */
import { io } from 'socket.io-client'
import { ref, reactive } from 'vue'

// 连接状态
export const isConnected = ref(false)
export const connectionError = ref(null)

// 进度状态管理
export const progressState = reactive({
  // 当前活跃的进度会话
  activeSessions: new Map(),
  // 进度监听器
  listeners: new Map()
})

class SocketService {
  constructor() {
    this.socket = null
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
    this.reconnectDelay = 1000
  }

  /**
   * 初始化 Socket.IO 连接
   */
  initialize() {
    if (this.socket && this.socket.connected) {
      return this.socket
    }

    // 从环境变量或配置中获取服务器地址
    let serverUrl = import.meta.env.VITE_SERVER_URL

    // 如果没有配置环境变量，则根据当前环境自动推断
    if (!serverUrl) {
      const { protocol, hostname, port } = window.location

      // 开发环境默认使用 9005 端口，生产环境使用当前页面的端口
      const targetPort = import.meta.env.DEV ? '9005' : port
      serverUrl = `${protocol}//${hostname}:${targetPort}`
    }

    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      forceNew: false, // 允许复用连接
      autoConnect: true // 自动连接
    })

    this.setupEventHandlers()
    this.setupPageVisibilityHandler()
    return this.socket
  }

  /**
   * 设置 Socket 事件处理器
   */
  setupEventHandlers() {
    if (!this.socket) return

    // 连接成功
    this.socket.on('connect', () => {
      console.log('🔗 Socket 连接成功:', this.socket.id)
      isConnected.value = true
      connectionError.value = null
      this.reconnectAttempts = 0
    })

    // 连接断开
    this.socket.on('disconnect', (reason) => {
      console.log('❌ Socket 连接断开:', reason)
      isConnected.value = false

      // 自动重连逻辑
      if (reason === 'io server disconnect') {
        // 服务器主动断开，不重连
        console.log('服务器主动断开连接，不进行重连')
        return
      }

      // 如果是客户端主动断开（如页面切换），也不重连
      if (reason === 'io client disconnect') {
        console.log('客户端主动断开连接，不进行重连')
        return
      }

      // 其他原因（如网络问题）才进行重连
      console.log('连接意外断开，准备重连...')
      this.attemptReconnect()
    })

    // 连接错误
    this.socket.on('connect_error', (error) => {
      console.error('Socket 连接错误:', error)
      connectionError.value = error.message
      isConnected.value = false
      this.attemptReconnect()
    })

    // 进度更新事件
    this.socket.on('device:operation_progress', (data) => {
      this.handleProgressUpdate(data)
    })

    // 操作结果事件（用于清理进度状态）
    this.socket.on('operation:result', (data) => {
      this.handleOperationComplete(data)
    })
  }

  /**
   * 尝试重连
   */
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Socket 重连失败，已达到最大重连次数')
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1) // 指数退避

    console.log(`🔄 尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})，${delay}ms 后重试`)

    setTimeout(() => {
      // 检查 socket 是否存在且未连接
      if (this.socket && !this.socket.connected) {
        try {
          this.socket.connect()
        } catch (error) {
          console.error('重连失败:', error)
          // 如果连接失败，重新初始化 socket
          this.initialize()
        }
      } else if (!this.socket) {
        // 如果 socket 为 null，重新初始化
        console.log('Socket 实例不存在，重新初始化')
        this.initialize()
      }
    }, delay)
  }

  /**
   * 处理进度更新
   */
  handleProgressUpdate(data) {
    const { sessionId, deviceId, step, progress, message, error, totalSteps } = data

    if (!sessionId) return

    // 更新进度状态
    const progressInfo = {
      sessionId,
      deviceId,
      step,
      progress: Math.min(100, Math.max(0, progress || 0)),
      message: message || '',
      error: error || null,
      totalSteps: totalSteps || 5,
      timestamp: new Date().toISOString()
    }

    progressState.activeSessions.set(sessionId, progressInfo)

    // 通知监听器
    const listeners = progressState.listeners.get(sessionId) || []
    listeners.forEach(callback => {
      try {
        callback(progressInfo)
      } catch (err) {
        console.error('进度更新回调执行失败:', err)
      }
    })

    console.log(`📊 进度更新 [${sessionId}]:`, progressInfo)
  }

  /**
   * 处理操作完成
   */
  handleOperationComplete(data) {
    const { deviceId, sessionId } = data

    // 查找并清理相关的进度会话
    if (sessionId) {
      progressState.activeSessions.delete(sessionId)
      progressState.listeners.delete(sessionId)
    } else if (deviceId) {
      // 如果没有 sessionId，根据 deviceId 清理
      for (const [id, session] of progressState.activeSessions.entries()) {
        if (session.deviceId === deviceId) {
          progressState.activeSessions.delete(id)
          progressState.listeners.delete(id)
        }
      }
    }

    console.log(`✅ 操作完成，清理进度状态: ${sessionId || deviceId}`)
  }

  /**
   * 订阅进度更新
   */
  subscribeProgress(sessionId, callback) {
    if (!sessionId || typeof callback !== 'function') {
      console.warn('订阅进度更新参数无效')
      return
    }

    const listeners = progressState.listeners.get(sessionId) || []
    listeners.push(callback)
    progressState.listeners.set(sessionId, listeners)

    console.log(`👂 订阅进度更新: ${sessionId}`)

    // 如果已有进度数据，立即触发回调
    const existingProgress = progressState.activeSessions.get(sessionId)
    if (existingProgress) {
      callback(existingProgress)
    }
  }

  /**
   * 取消订阅进度更新
   */
  unsubscribeProgress(sessionId, callback = null) {
    if (!sessionId) return

    if (callback) {
      // 移除特定回调
      const listeners = progressState.listeners.get(sessionId) || []
      const index = listeners.indexOf(callback)
      if (index > -1) {
        listeners.splice(index, 1)
        if (listeners.length === 0) {
          progressState.listeners.delete(sessionId)
        } else {
          progressState.listeners.set(sessionId, listeners)
        }
      }
    } else {
      // 移除所有回调
      progressState.listeners.delete(sessionId)
    }

    console.log(`👋 取消订阅进度更新: ${sessionId}`)
  }

  /**
   * 发送消息到服务器
   */
  emit(event, data) {
    if (!this.socket || !this.socket.connected) {
      console.warn('Socket 未连接，无法发送消息')
      return false
    }

    this.socket.emit(event, data)
    return true
  }

  /**
   * 监听服务器事件
   */
  on(event, callback) {
    if (!this.socket) {
      console.warn('Socket 未初始化')
      return
    }

    this.socket.on(event, callback)
  }

  /**
   * 取消监听事件
   */
  off(event, callback = null) {
    if (!this.socket) return

    if (callback) {
      this.socket.off(event, callback)
    } else {
      this.socket.off(event)
    }
  }

  /**
   * 设置页面可见性变化处理器
   */
  setupPageVisibilityHandler() {
    // 防止重复绑定
    if (this.pageVisibilitySetup) return
    this.pageVisibilitySetup = true

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // 页面变为可见时，检查连接状态
        if (!this.connected) {
          console.log('页面重新可见，检查并恢复 Socket 连接')
          this.reconnectAttempts = 0 // 重置重连计数
          setTimeout(() => {
            if (!this.connected) {
              this.initialize()
            }
          }, 500) // 稍微延迟一下再重连
        }
      } else if (document.visibilityState === 'hidden') {
        // 页面隐藏时，可以选择不做任何操作，让连接保持
        console.log('页面隐藏，Socket 连接保持')
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    // 处理窗口焦点事件
    const handleFocus = () => {
      if (!this.connected) {
        console.log('窗口重新获得焦点，检查 Socket 连接')
        setTimeout(() => {
          if (!this.connected) {
            this.reconnectAttempts = 0
            this.initialize()
          }
        }, 300)
      }
    }

    window.addEventListener('focus', handleFocus)
  }

  /**
   * 连接到服务器 (初始化的别名)
   */
  connect() {
    return this.initialize()
  }

  /**
   * 监听设备进度更新 (便捷方法)
   */
  onDeviceProgress(callback) {
    if (!callback || typeof callback !== 'function') {
      console.warn('设备进度监听器回调无效')
      return
    }

    // 监听设备操作进度事件
    this.on('device:operation_progress', callback)
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.socket) {
      try {
        this.socket.removeAllListeners() // 移除所有事件监听器
        this.socket.disconnect()
      } catch (error) {
        console.warn('断开 Socket 连接时发生错误:', error)
      }
      this.socket = null
    }
    isConnected.value = false
    connectionError.value = null
    this.reconnectAttempts = 0
    progressState.activeSessions.clear()
    progressState.listeners.clear()
  }

  /**
   * 强制重新连接
   */
  forceReconnect() {
    console.log('强制重新连接 Socket')
    this.disconnect()
    this.reconnectAttempts = 0
    return this.initialize()
  }

  /**
   * 获取当前连接状态
   */
  get connected() {
    return this.socket?.connected || false
  }
}

// 创建单例实例
const socketService = new SocketService()

export default socketService