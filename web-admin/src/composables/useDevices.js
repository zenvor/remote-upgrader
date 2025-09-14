import { ref } from 'vue'
import { deviceApi } from '@/api'
import { initRealtime, on as realtimeOn, emit as realtimeEmit, isRealtimeConnected } from '@/services/realtime'
import toast from '@/utils/toast'

export function useDevices() {
  const devices = ref([])
  const total = ref(0)
  const selectedDevices = ref([])
  const loading = ref(false)
  const refreshing = ref(false)
  const deviceLogs = ref([])
  // 使用全局实时连接状态
  const isConnected = isRealtimeConnected

  // 获取设备列表（支持筛选参数）
  const fetchDevices = async (filters = {}) => {
    loading.value = true
    try {
      // 将筛选参数传递给后端API
      const response = await deviceApi.getDeviceList(filters)
      devices.value = response.devices
      total.value = response.total
    } catch (error) {
      console.error('获取设备列表失败:', error)
    } finally {
      loading.value = false
    }
  }

  // 升级设备
  const upgradeDevice = async (device, project, packageInfo = null, options = {}) => {
    try {
      // 如果没有指定包信息，需要先选择包
      if (!packageInfo) {
        // TODO: 显示包选择对话框
        console.log(`升级设备 ${device.deviceName} 的 ${project} 项目`)
        return
      }

      const response = await deviceApi.upgradeDevice(device.deviceId, {
        project,
        fileName: packageInfo.fileName,
        version: packageInfo.version,
        deployPath: options.deployPath || undefined
      })

      if (response.success) {
        // 更新设备状态为升级中
        const deviceIndex = devices.value.findIndex(d => d.deviceId === device.deviceId)
        if (deviceIndex !== -1) {
          devices.value[deviceIndex].status = 'upgrading'
        }
        
        toast.success(`设备 "${device.deviceName}" 升级命令已发送`, '升级启动')
      }
    } catch (error) {
      console.error('升级设备失败:', error)
      toast.error(`设备升级失败: ${error.message}`, '升级失败')
      throw error
    }
  }

  // 回滚设备
  const rollbackDevice = async (device, project = null) => {
    try {
      const response = await deviceApi.rollbackDevice(device.deviceId, project)

      if (response.success) {
        toast.success(`设备 "${device.deviceName}" 回滚命令已发送`, '回滚启动')
      }
    } catch (error) {
      console.error('回滚设备失败:', error)
      toast.error(`设备回滚失败: ${error.message}`, '回滚失败')
      throw error
    }
  }

  // 批量升级
  const batchUpgrade = async (deviceList, project, packageInfo, options = {}) => {
    const promises = deviceList.map(device => 
      upgradeDevice(device, project, packageInfo, options)
    )

    try {
      await Promise.all(promises)
      console.log(`批量升级完成，共 ${deviceList.length} 个设备`)
    } catch (error) {
      console.error('批量升级失败:', error)
      throw error
    }
  }

  // 批量回滚
  const batchRollback = async (deviceList, project = null) => {
    const promises = deviceList.map(device => 
      rollbackDevice(device, project)
    )

    try {
      await Promise.all(promises)
      console.log(`批量回滚完成，共 ${deviceList.length} 个设备`)
    } catch (error) {
      console.error('批量回滚失败:', error)
      throw error
    }
  }

  // 获取设备详细信息
  const getDeviceDetail = async (deviceId) => {
    try {
      const response = await deviceApi.getDeviceDetail(deviceId)
      return response
    } catch (error) {
      console.error('获取设备详情失败:', error)
      throw error
    }
  }

  // 绑定全局 WebSocket 事件（仅一次）
  let deviceRealtimeBound = false
  const deviceRealtimeHandlers = {}
  const bindDeviceRealtimeEvents = () => {
    if (deviceRealtimeBound) return
    initRealtime()

    deviceRealtimeHandlers.online = (data) => {
      const deviceIndex = devices.value.findIndex(d => d.deviceId === data.deviceId)
      if (deviceIndex !== -1) {
        devices.value[deviceIndex] = {
          ...devices.value[deviceIndex],
          status: 'online',
          lastSeen: Date.now(),
          connectedAt: data.connectedAt || new Date().toISOString()
        }
      } else {
        devices.value.push({
          deviceId: data.deviceId,
          deviceName: data.deviceName || data.deviceId,
          status: 'online',
          lastSeen: Date.now(),
          connectedAt: data.connectedAt || new Date().toISOString(),
          versions: data.versions || { frontend: null, backend: null },
          upgradeProgress: null
        })
      }
      toast.info(`设备 "${data.deviceName || data.deviceId}" 已上线`, '设备状态')
    }

    deviceRealtimeHandlers.statusChanged = (data) => {
      const deviceIndex = devices.value.findIndex(d => d.deviceId === data.deviceId)
      if (deviceIndex !== -1) {
        devices.value[deviceIndex] = {
          ...devices.value[deviceIndex],
          ...data,
          lastSeen: Date.now()
        }
        if (data.status === 'upgrading') {
          toast.info(`设备 "${devices.value[deviceIndex].deviceName}" 开始升级`, '升级状态')
        } else if (data.status === 'error') {
          toast.error(`设备 "${devices.value[deviceIndex].deviceName}" 出现错误`, '设备错误')
        }
      }
    }

    deviceRealtimeHandlers.operationResult = (data) => {
      const deviceIndex = devices.value.findIndex(d => d.deviceId === data.deviceId)
      if (deviceIndex !== -1) {
        const deviceName = devices.value[deviceIndex].deviceName || data.deviceId
        if (data.operation === 'upgrade') {
          if (data.success) {
            devices.value[deviceIndex].status = 'online'
            devices.value[deviceIndex].upgradeProgress = null
            if (data.versions) {
              devices.value[deviceIndex].versions = {
                ...devices.value[deviceIndex].versions,
                ...data.versions
              }
            }
            toast.success(`设备 "${deviceName}" 升级完成`, '升级成功')
          } else {
            devices.value[deviceIndex].status = 'error'
            devices.value[deviceIndex].upgradeProgress = null
            toast.error(`设备 "${deviceName}" 升级失败: ${data.error || '未知错误'}`, '升级失败')
          }
        } else if (data.operation === 'rollback') {
          if (data.success) {
            devices.value[deviceIndex].status = 'online'
            if (data.versions) {
              devices.value[deviceIndex].versions = {
                ...devices.value[deviceIndex].versions,
                ...data.versions
              }
            }
            toast.success(`设备 "${deviceName}" 回滚完成`, '回滚成功')
          } else {
            devices.value[deviceIndex].status = 'error'
            toast.error(`设备 "${deviceName}" 回滚失败: ${data.error || '未知错误'}`, '回滚失败')
          }
        } else if (data.operation === 'restart') {
          if (data.success) {
            toast.success(`设备 "${deviceName}" 重启完成`, '重启成功')
          } else {
            toast.error(`设备 "${deviceName}" 重启失败: ${data.error || '未知错误'}`, '重启失败')
          }
        }
      }
    }

    deviceRealtimeHandlers.deviceLog = (data) => {
      const selectedDeviceId = getCurrentSelectedDeviceId()
      if (data.deviceId === selectedDeviceId) {
        deviceLogs.value.push({
          timestamp: Date.now(),
          level: data.level || 'info',
          message: data.message,
          deviceId: data.deviceId
        })
        if (deviceLogs.value.length > 100) {
          deviceLogs.value = deviceLogs.value.slice(-100)
        }
      }
    }

    realtimeOn('device:online', deviceRealtimeHandlers.online)
    realtimeOn('device:status_changed', deviceRealtimeHandlers.statusChanged)
    realtimeOn('operation:result', deviceRealtimeHandlers.operationResult)
    realtimeOn('device:log', deviceRealtimeHandlers.deviceLog)

    // 网络信息更新监听
    deviceRealtimeHandlers.networkUpdated = (data) => {
      const deviceIndex = devices.value.findIndex(d => d.deviceId === data.deviceId)
      if (deviceIndex !== -1) {
        devices.value[deviceIndex] = {
          ...devices.value[deviceIndex],
          wifiName: data.wifiName,
          wifiSignal: data.wifiSignal,
          publicIp: data.publicIp
        }
      }
    }
    realtimeOn('device:network_updated', deviceRealtimeHandlers.networkUpdated)

    // 设备列表变更监听 - 智能更新策略
    deviceRealtimeHandlers.listChanged = async (data) => {
      const { action, deviceId, deviceName, total: newTotal } = data
      
      // 更新总数
      total.value = newTotal || devices.value.length
      
      if (action === 'add') {
        // 新设备上线：如果当前在第一页，重新获取数据
        const pagination = getCurrentPagination()
        if (pagination && pagination.current === 1) {
          console.log(`检测到新设备 ${deviceName}，当前在第一页，重新获取设备列表`)
          await fetchDevices({ pageNum: 1, pageSize: pagination.pageSize })
        } else {
          console.log(`检测到新设备 ${deviceName}，但不在第一页，仅更新统计`)
        }
      } else if (action === 'offline') {
        // 设备离线：标记为离线状态
        const deviceIndex = devices.value.findIndex(d => d.deviceId === deviceId)
        if (deviceIndex !== -1) {
          devices.value[deviceIndex] = {
            ...devices.value[deviceIndex],
            status: 'offline'
          }
        }
      }
    }
    realtimeOn('device:list_changed', deviceRealtimeHandlers.listChanged)

    // 可按需补充包相关事件
    realtimeOn('pkg:status_response', (data) => {
      console.log('包状态响应:', data)
    })
    realtimeOn('pkg:ack', (data) => {
      console.log('包分片确认:', data)
    })
    realtimeOn('pkg:verified', (data) => {
      console.log('包校验结果:', data)
    })

    deviceRealtimeBound = true
  }

  // 立即绑定全局事件（幂等）
  bindDeviceRealtimeEvents()

  // 获取当前选中的设备ID（用于日志过滤）
  const getCurrentSelectedDeviceId = () => {
    // 目前界面层未将选中设备ID传入此 composable，保持不过滤日志
    return null
  }

  // 获取当前分页信息（用于智能列表更新）
  const getCurrentPagination = () => {
    // 由于 composable 无法直接访问页面的分页状态，返回默认值
    // 实际项目中可以通过参数传入或使用全局状态管理
    return { current: 1, pageSize: 10 }
  }

  // 发送 WebSocket 命令到设备（通过服务器转发）
  const sendSocketCommand = (deviceId, command, data = {}) => {
    if (!isRealtimeConnected.value) {
      console.warn('WebSocket 未连接，无法发送命令')
      toast.error('实时连接未建立，请刷新页面重试', '连接错误')
      return false
    }
    const payload = { deviceId, command, data, timestamp: Date.now() }
    realtimeEmit('device:command', payload)
    console.log('发送设备命令:', payload)
    return true
  }

  // 请求设备状态刷新
  const requestDeviceStatus = (deviceId = null) => {
    if (!isRealtimeConnected.value) return false
    if (deviceId) {
      realtimeEmit('device:status_request', { deviceId })
    } else {
      realtimeEmit('device:status_request_all')
    }
    return true
  }

  // 检测离线设备（基于心跳超时）
  const checkOfflineDevices = () => {
    const now = Date.now()
    const offlineThreshold = 30000 // 30秒无心跳则认为离线

    devices.value.forEach((device, index) => {
      if (device.status === 'online' && device.lastSeen) {
        if (now - device.lastSeen > offlineThreshold) {
          devices.value[index] = {
            ...device,
            status: 'offline'
          }
          console.log(`设备 ${device.deviceName} 被标记为离线`)
          toast.warn(`设备 "${device.deviceName}" 已离线`, '设备状态')
        }
      }
    })
  }

  // 启动离线检测定时器
  let offlineCheckTimer = null
  const startOfflineDetection = () => {
    if (offlineCheckTimer) {
      clearInterval(offlineCheckTimer)
    }
    // 每15秒检查一次离线设备
    offlineCheckTimer = setInterval(checkOfflineDevices, 15000)
    console.log('离线检测定时器已启动')
  }

  // 停止离线检测定时器
  const stopOfflineDetection = () => {
    if (offlineCheckTimer) {
      clearInterval(offlineCheckTimer)
      offlineCheckTimer = null
      console.log('离线检测定时器已停止')
    }
  }

  

  // 发送设备命令
  const sendDeviceCommand = async (deviceId, command, data = {}) => {
    try {
      const response = await deviceApi.sendDeviceCommand(deviceId, command, data)
      return response
    } catch (error) {
      console.error('发送设备命令失败:', error)
      throw error
    }
  }

  // 重启设备服务
  const restartDevice = async (device, service = 'all') => {
    try {
      await deviceApi.restartDevice(device.deviceId, service)
      console.log(`设备 ${device.deviceName} 重启命令已发送`)
    } catch (error) {
      console.error('重启设备失败:', error)
      throw error
    }
  }

  // 批量重启
  const batchRestart = async (deviceList, service = 'all') => {
    const promises = deviceList.map(device => 
      restartDevice(device, service)
    )

    try {
      await Promise.all(promises)
      console.log(`批量重启完成，共 ${deviceList.length} 个设备`)
    } catch (error) {
      console.error('批量重启失败:', error)
      throw error
    }
  }

  // 获取设备的原部署目录路径配置
  const getDeviceDeployPath = async (deviceId) => {
    try {
      const response = await deviceApi.getDeviceDeployPath(deviceId)
      return response
    } catch (error) {
      console.error('获取设备配置失败:', error)
      throw error
    }
  }

  // 设置设备的原部署目录路径配置
  const setDeviceDeployPath = async (deviceId, deployPath) => {
    try {
      const response = await deviceApi.setDeviceDeployPath(deviceId, deployPath)
      
      // 更新本地设备列表中的配置信息
      const deviceIndex = devices.value.findIndex(d => d.deviceId === deviceId)
      if (deviceIndex !== -1) {
        devices.value[deviceIndex] = {
          ...devices.value[deviceIndex],
          deployPath: deployPath,
          hasDeployPath: true
        }
      }
      
      return response
    } catch (error) {
      console.error('设置设备配置失败:', error)
      throw error
    }
  }

  // 检查设备是否需要配置原部署目录路径
  const checkDeviceNeedsConfig = (device) => {
    return !device.deployPath && !device.hasDeployPath
  }

  // 获取需要配置原部署目录路径的设备列表
  const getDevicesNeedingConfig = () => {
    return devices.value.filter(device => checkDeviceNeedsConfig(device))
  }

  return {
    // 响应式状态
    devices,
    selectedDevices,
    loading,
    refreshing,
    deviceLogs,
    isConnected,
    
    // 设备管理功能
    fetchDevices,
    upgradeDevice,
    rollbackDevice,
    batchUpgrade,
    batchRollback,
    getDeviceDetail,
    sendDeviceCommand,
    restartDevice,
    batchRestart,
    
    // WebSocket 实时通信功能
    sendSocketCommand,
    requestDeviceStatus,
    startOfflineDetection,
    stopOfflineDetection,
    
    // 设备配置管理功能
    getDeviceDeployPath,
    setDeviceDeployPath,
    checkDeviceNeedsConfig,
    getDevicesNeedingConfig
  }
}
