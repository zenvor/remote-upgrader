import { ref } from 'vue'
import { deviceApi } from '@/api'
// 已移除 socket.io 实时通信，统一使用 HTTP 接口刷新
import toast from '@/utils/toast'

export function useDevices() {
  const devices = ref([])
  const total = ref(0)
  const onlineCount = ref(0)
  const selectedDevices = ref([])
  const loading = ref(false)
  const refreshing = ref(false)
  const deviceLogs = ref([])
  // 已移除实时连接状态，统一通过 HTTP 轮询刷新

  // 设备筛选条件与分页状态
  const filtersState = ref({
    status: 'all',
    search: ''
  })
  const paginationState = ref({
    pageNum: 1,
    pageSize: 20,
    totalPages: 1
  })

  // 统一整理设备字段，方便前端展示
  const normalizeDevice = (device = {}) => {
    const system = device.system || {}
    const network = device.network || {}
    const agent = device.agent || {}
    const storage = device.storage || {}
    const health = device.health || {}
    const deploy = device.deploy || {}
    // 统一从新结构 deploy.currentDeployments 中派生路径与版本，兼容旧字段
    const currentDeployments = deploy.currentDeployments || {}
    const deployPaths = {
      frontend: currentDeployments.frontend?.deployPath
        || deploy.currentDeployPaths?.frontend
        || device.deployPaths?.frontend
        || null,
      backend: currentDeployments.backend?.deployPath
        || deploy.currentDeployPaths?.backend
        || device.deployPaths?.backend
        || null
    }
    // 生成与后端一致的 currentVersions 结构（对象形态），兼容旧字段
    const buildVersionObj = (project) => {
      const newD = currentDeployments?.[project] || {}
      const oldD = deploy.currentVersions?.[project] || {}
      return {
        version: newD.version ?? oldD.version ?? null,
        deployDate: newD.deployDate ?? oldD.deployDate ?? null,
        deployPath: newD.deployPath ?? oldD.deployPath ?? null,
        packageInfo: newD.packageInfo ?? oldD.packageInfo ?? null,
        status: newD.status ?? oldD.status ?? null,
        lastOperationType: newD.lastOperationType ?? oldD.lastOperationType ?? null,
        lastOperationDate: newD.lastOperationDate ?? oldD.lastOperationDate ?? null,
      }
    }
    const currentVersions = {
      frontend: buildVersionObj('frontend'),
      backend: buildVersionObj('backend')
    }

    return {
      ...device,
      deviceName: device.deviceName || device.deviceId,
      system,
      network,
      agent,
      storage,
      health,
      deploy,
      hasDeployPath: typeof device.hasDeployPath === 'boolean'
        ? device.hasDeployPath
        : Boolean(deployPaths.frontend || deployPaths.backend),
      version: currentVersions.frontend?.version || currentVersions.backend?.version || null,
      platform: system.platform || null,
      osVersion: system.osVersion || null,
      arch: system.arch || null,
      wifiName: network.wifiName || null,
      wifiSignal: typeof network.wifiSignal === 'number' ? network.wifiSignal : null,
      publicIp: network.publicIp || null,
      localIp: network.localIp || null,
      macAddresses: Array.isArray(network.macAddresses) ? network.macAddresses : [],
      agentVersion: agent.agentVersion || null,
      diskFreeBytes: typeof storage.diskFreeBytes === 'number' ? storage.diskFreeBytes : null,
      writable: typeof storage.writable === 'boolean' ? storage.writable : null,
      uptimeSeconds: typeof health.uptimeSeconds === 'number' ? health.uptimeSeconds : null,
      frontendVersion: currentVersions.frontend?.version || null,
      backendVersion: currentVersions.backend?.version || null,
      frontendDeployPath: deployPaths.frontend || null,
      backendDeployPath: deployPaths.backend || null,
      deployInfo: {
        rollbackAvailable: typeof deploy.rollbackAvailable === 'boolean' ? deploy.rollbackAvailable : null,
        lastDeployStatus: deploy.lastDeployStatus || null,
        lastDeployAt: deploy.lastDeployAt || null,
        lastRollbackAt: deploy.lastRollbackAt || null,
        deployPaths,
        currentVersions
      }
    }
  }

  // 获取设备列表（支持筛选参数）
  const fetchDevices = async (filters = {}) => {
    loading.value = true
    try {
      // 组装查询参数，保证兼容默认值
      const query = {
        status: filters.status ?? filtersState.value.status ?? 'all',
        search: filters.search ?? filtersState.value.search ?? '',
        pageNum: filters.pageNum ?? paginationState.value.pageNum ?? 1,
        pageSize: filters.pageSize ?? paginationState.value.pageSize ?? 20
      }

      const response = await deviceApi.getDeviceList(query)

      if (response && response.success === false) {
        throw new Error(response.error || response.message || '获取设备列表失败')
      }

      const list = Array.isArray(response?.devices) ? response.devices.map(normalizeDevice) : []
      devices.value = list
      total.value = typeof response?.total === 'number' ? response.total : list.length
      onlineCount.value = typeof response?.onlineCount === 'number'
        ? response.onlineCount
        : list.filter(device => device.status === 'online').length

      filtersState.value = {
        status: response?.filters?.status || query.status || 'all',
        search: response?.filters?.search || query.search || ''
      }

      const currentPageNum = typeof response?.pageNum === 'number' ? response.pageNum : query.pageNum
      const currentPageSize = typeof response?.pageSize === 'number' ? response.pageSize : query.pageSize
      const totalPages = typeof response?.totalPages === 'number'
        ? response.totalPages
        : Math.max(1, Math.ceil((total.value || 0) / currentPageSize))

      paginationState.value = {
        pageNum: currentPageNum,
        pageSize: currentPageSize,
        totalPages
      }

      return {
        devices: list,
        total: total.value,
        onlineCount: onlineCount.value,
        pageNum: currentPageNum,
        pageSize: currentPageSize,
        totalPages,
        filters: { ...filtersState.value }
      }
    } catch (error) {
      console.error('获取设备列表失败:', error)
      toast.error(error.message || '获取设备列表失败', '设备列表')
      throw error
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
        fileMD5: packageInfo.fileMD5,
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
  const rollbackDevice = async (device, project) => {
    try {
      const response = await deviceApi.rollbackDevice(device.deviceId, project)

      if (response.success) {
        // 更新设备状态为升级中（回滚也是一种升级操作）
        const deviceIndex = devices.value.findIndex(d => d.deviceId === device.deviceId)
        if (deviceIndex !== -1) {
          devices.value[deviceIndex] = {
            ...devices.value[deviceIndex],
            status: 'upgrading'
          }
        }
        
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
  const batchRollback = async (deviceList, project) => {
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

  // 绑定全局 WebSocket 事件（已移除，保留空实现以兼容调用）
  let deviceRealtimeBound = false
  const deviceRealtimeHandlers = {}
  const bindDeviceRealtimeEvents = () => {
    // 已移除实时事件绑定（HTTP 轮询替代）
    deviceRealtimeBound = true
  }

  // 立即绑定全局事件（空实现，不做任何事）
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

  // 兼容保留：已不再通过实时通信发送命令/请求状态
  const sendSocketCommand = (deviceId, command, data = {}) => {
    console.warn('已移除实时通信，sendSocketCommand 不再生效，请改用 HTTP 接口')
    return false
  }

  const requestDeviceStatus = (deviceId = null) => {
    console.warn('已移除实时通信，requestDeviceStatus 不再生效，请使用 fetchDevices() 刷新')
    return false
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


  return {
    // 响应式状态
    devices,
    total,
    onlineCount,
    selectedDevices,
    loading,
    refreshing,
    deviceLogs,
    filters: filtersState,
    pagination: paginationState,
    
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
    
    // 轮询与离线检测
    startOfflineDetection,
    stopOfflineDetection,
    
  }
}
