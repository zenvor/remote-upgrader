// 全局 WebSocket 实时通信服务（基于 socket.io-client）
// 目标：在应用整个生命周期内保持长连接，避免路由切换导致断开

import { ref } from 'vue'
import { io } from 'socket.io-client'
import { BASE_URL } from '@/api'

// 连接状态（全局响应式）
export const isRealtimeConnected = ref(false)

let socketInstance = null
let hasBaseEventsBound = false

/**
 * 初始化全局实时连接（幂等）
 */
export function initRealtime() {
  if (socketInstance) {
    return socketInstance
  }

  socketInstance = io(BASE_URL, {
    transports: ['websocket'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  })

  bindBaseEvents()
  return socketInstance
}

/**
 * 绑定基础连接事件（仅一次）
 */
function bindBaseEvents() {
  if (!socketInstance || hasBaseEventsBound) return
  hasBaseEventsBound = true

  socketInstance.on('connect', () => {
    isRealtimeConnected.value = true
  })

  socketInstance.on('disconnect', () => {
    isRealtimeConnected.value = false
  })

  socketInstance.on('connect_error', () => {
    isRealtimeConnected.value = false
  })

  socketInstance.on('reconnect', () => {
    isRealtimeConnected.value = true
  })

  socketInstance.on('reconnect_failed', () => {
    isRealtimeConnected.value = false
  })
}

/** 获取全局 socket 实例（未初始化会自动初始化） */
export function getSocket() {
  return initRealtime()
}

/** 事件订阅（语法糖） */
export function on(event, handler) {
  getSocket().on(event, handler)
}

/** 事件取消订阅（语法糖） */
export function off(event, handler) {
  if (!socketInstance) return
  socketInstance.off(event, handler)
}

/** 发送事件（语法糖） */
export function emit(event, payload) {
  getSocket().emit(event, payload)
}

/** 可选：应用关闭时断开（防资源泄露） */
export function disposeRealtime() {
  if (socketInstance) {
    socketInstance.disconnect()
    socketInstance = null
    isRealtimeConnected.value = false
    hasBaseEventsBound = false
  }
}


