// 中文注释：ESM 导入
import deviceManager from '../models/deviceManager.js'
import { updateDeviceTaskStatus } from './batchController.js'
import { DateHelper } from '../utils/common.js'

/**
 * Socket.IO 事件处理
 */
export function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`Socket 连接: ${socket.id}`)

    // 设备注册
    socket.on('device:register', async (data) => {
      try {
        // 验证注册数据
        if (!data || typeof data !== 'object') {
          socket.emit('device:registered', {
            success: false,
            error: '无效的注册数据'
          })
          return
        }

        // 直接按分组结构注册
        const device = deviceManager.registerDevice(socket, data)

        socket.emit('device:registered', {
          success: true,
          deviceId: device.deviceId,
          message: '设备注册成功'
        })

        // 注册成功后立即查询设备当前版本信息
        setTimeout(async () => {
          await queryDeviceVersions(device.deviceId)
        }, 1000) // 延迟1秒，确保设备完全连接

        // 通知其他客户端有新设备上线
        socket.broadcast.emit('device:online', {
          deviceId: device.deviceId,
          deviceName: device.info.deviceName,
          connectedAt: device.connectedAt
        })

        // 通知设备列表发生变更
        socket.broadcast.emit('device:list_changed', {
          action: 'add',
          deviceId: device.deviceId,
          deviceName: device.info.deviceName,
          total: deviceManager.getDeviceCount()
        })
      } catch (error) {
        console.error('设备注册失败:', error)
        socket.emit('device:registered', {
          success: false,
          error: error.message
        })
      }
    })

    // 设备心跳（可携带网络与系统信息的轻量更新）
    socket.on('device:heartbeat', (data) => {
      if (!data || typeof data !== 'object') {
        return
      }
      const { deviceId } = data
      if (deviceId && typeof deviceId === 'string') {
        // 可选网络刷新（接受顶层上报）
        const { wifiName, wifiSignal, localIp, macAddresses } = data || {}
        if (
          wifiName !== undefined ||
          wifiSignal !== undefined ||
          localIp !== undefined ||
          Array.isArray(macAddresses)
        ) {
          deviceManager.updateNetworkInfo(deviceId, {
            wifiName,
            wifiSignal,
            localIp,
            macAddresses
          })
        } else {
          deviceManager.updateHeartbeat(deviceId)
        }

        // 可选系统/健康轻量信息（按分组）
        if (data.health || data.system || data.agent || data.deploy) {
          const payload = {
            agentVersion: data.agent?.agentVersion,
            osVersion: data.system?.osVersion,
            arch: data.system?.arch,
            uptimeSeconds: data.health?.uptimeSeconds,
            rollbackAvailable: data.deploy?.rollbackAvailable
          }
          deviceManager.updateSystemInfo(deviceId, payload)
        }

        socket.emit('device:heartbeat_ack', {
          timestamp: new Date().toISOString()
        })
      }
    })

    // 设备状态更新
    socket.on('device:status', (data) => {
      if (!data || typeof data !== 'object' || !data.deviceId) {
        return
      }
      const { deviceId } = data
      console.log(`设备状态更新: ${deviceId}`, data)

      // 广播设备状态变化
      socket.broadcast.emit('device:status_changed', data)
    })

    // 网络信息更新（包含 WiFi、公网/本地 IP、MAC）
    socket.on('device:update-network', (data) => {
      try {
        if (!data || typeof data !== 'object' || !data.deviceId || !data.network) {
          return
        }
        const { deviceId, network } = data
        deviceManager.updateNetworkInfo(deviceId, network)

        // 广播网络信息变化到管理端
        socket.broadcast.emit('device:network_updated', {
          deviceId,
          network,
          timestamp: data.timestamp
        })
      } catch (error) {
        console.error('更新网络信息失败:', error)
      }
    })

    // 系统信息更新（agent 版本、OS、架构、磁盘、回滚可用等）
    socket.on('device:update-system', (data) => {
      try {
        const deviceId = data?.deviceId
        if (deviceId) {
          const payload = {
            agentVersion: data.agent?.agentVersion,
            osVersion: data.system?.osVersion,
            arch: data.system?.arch,
            uptimeSeconds: data.health?.uptimeSeconds,
            rollbackAvailable: data.deploy?.rollbackAvailable
          }
          deviceManager.updateSystemInfo(deviceId, payload)
          socket.broadcast.emit('device:system_updated', {
            deviceId,
            ...payload,
            timestamp: new Date().toISOString()
          })
        }
      } catch (error) {
        console.error('更新系统信息失败:', error)
      }
    })

    // WiFi信息更新（保留兼容性）
    socket.on('device:update-wifi', (data) => {
      try {
        if (!data || typeof data !== 'object' || !data.deviceId) {
          return
        }
        const device = deviceManager.getDevice(data.deviceId)
        if (device) {
          // 更新设备WiFi信息到分组字段
          device.info.network = device.info.network || {}
          device.info.network.wifiName = data.wifiName
          device.info.network.wifiSignal = data.wifiSignal
          console.log(`WiFi信息更新: ${data.deviceId} (WiFi: ${data.wifiName})`)
        }
      } catch (error) {
        console.error('更新WiFi信息失败:', error)
      }
    })

    // 包分发相关事件
    socket.on('pkg:status', (data) => {
      if (!data || typeof data !== 'object' || !data.uploadId) {
        return
      }
      console.log('包状态查询:', data)
      // 这里将来处理包分发状态查询
      socket.emit('pkg:status_response', {
        uploadId: data.uploadId,
        missingChunks: []
      })
    })

    socket.on('pkg:ack', (data) => {
      if (!data || typeof data !== 'object') {
        return
      }
      console.log('包分片确认:', data)
      // 处理分片确认
    })

    socket.on('pkg:verified', (data) => {
      if (!data || typeof data !== 'object') {
        return
      }
      console.log('包校验结果:', data)
      // 处理包校验结果
    })

    // 操作结果上报
    socket.on('op:result', (data) => {
      if (!data || typeof data !== 'object') {
        return
      }
      console.log('操作结果:', data)
      // 广播操作结果
      socket.broadcast.emit('operation:result', data)
    })

    // 部署路径更新通知
    socket.on('deployPathUpdated', async (notification) => {
      try {
        console.log('📡 收到部署路径更新通知:', notification)

        let deviceId = notification?.data?.deviceId
        const project = notification?.data?.project
        const deployPath = notification?.data?.deployPath
        const version = notification?.data?.version
        const updatedAt = notification?.data?.updatedAt

        if (!deviceId) {
          // 尝试从 socket 获取设备ID
          const socketDeviceId = deviceManager.socketToDevice?.get?.(socket.id)
          if (socketDeviceId) {
            deviceId = socketDeviceId
          }
        }

        if (!deviceId || !project || !deployPath) {
          console.warn('部署路径更新通知缺少必要参数:', {
            deviceId,
            project,
            deployPath
          })
          return
        }

        // 更新设备配置中的部署路径
        await deviceManager.updateCurrentDeployPath(deviceId, project, deployPath, updatedAt, version)

        console.log(`✅ 已更新设备 ${deviceId} 的 ${project} 部署路径: ${deployPath}${version ? ` (版本: ${version})` : ''}`)

        // 广播部署路径变化事件给其他客户端
        socket.broadcast.emit('device:deploy_path_updated', {
          deviceId,
          project,
          deployPath,
          version,
          updatedAt,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        console.error('处理部署路径更新通知失败:', error)
      }
    })

    socket.on('command:result', async (result) => {
      try {
        console.log('命令执行结果:', result)
        const deviceId = result?.deviceId
        const success = result?.success
        const data = result?.data || {}

        if (!deviceId) {
          return
        }

        // 将结果广播给其他连接的客户端
        socket.broadcast.emit('command:result', result)

        const { operation, project, deployPath } = data
        const normalizedDeployPath = typeof deployPath === 'string' ? deployPath.trim() : deployPath || null
        if (!operation || !project || !['frontend', 'backend'].includes(project)) {
          return
        }

        const now = DateHelper.getCurrentDate()

        if (success) {
          await deviceManager.updateDeployMetadata(deviceId, project, {
            deployPath: normalizedDeployPath,
            status: operation === 'rollback' ? 'rollback_success' : 'upgrade_success',
            deployAt: now,
            rollbackAt: operation === 'rollback' ? now : undefined
          })

          // 更新当前版本信息（确保配置文件记录最新路径与版本）
          await deviceManager.updateCurrentVersion(deviceId, project, {
            version: data.version || null,
            deployPath: normalizedDeployPath,
            deployDate: now
          })

          await queryDeviceVersions(deviceId)

          socket.broadcast.emit('device:list_changed', {
            action: 'update',
            deviceId,
            total: deviceManager.getDeviceCount()
          })
        } else {
          await deviceManager.updateDeployMetadata(deviceId, project, {
            status: operation === 'rollback' ? 'rollback_failed' : 'upgrade_failed'
          })
        }

        const versionsUpdate = data.version ? { [project]: data.version } : null

        const operationEvent = {
          deviceId,
          project,
          operation,
          success,
          deployPath: normalizedDeployPath,
          version: data.version || null,
          timestamp: now,
          message: result?.message || null,
          versions: versionsUpdate
        }

        socket.broadcast.emit('operation:result', operationEvent)
      } catch (error) {
        console.error('处理命令执行结果失败:', error)
      }
    })

    // 批量任务状态更新
    socket.on('batch:device_status', (data) => {
      try {
        if (!data || typeof data !== 'object') {
          console.warn('批量任务状态更新：无效数据格式')
          return
        }

        const { taskId, deviceId, status, error, progress } = data

        if (!taskId || !deviceId || !status) {
          console.warn('批量任务状态更新：缺少必要参数', { taskId, deviceId, status })
          return
        }

        // 更新设备任务状态
        const updated = updateDeviceTaskStatus(taskId, deviceId, status, error)

        if (updated) {
          console.log(`📊 批量任务设备状态更新: ${taskId} - ${deviceId} - ${status}`)

          // 向所有管理客户端广播状态更新
          socket.broadcast.emit('batch:task_progress', {
            taskId,
            deviceId,
            status,
            error,
            progress,
            timestamp: new Date().toISOString()
          })
        } else {
          console.warn(`批量任务状态更新失败: ${taskId} - ${deviceId}`)
        }

      } catch (error) {
        console.error('处理批量任务状态更新失败:', error)
      }
    })

    // 批量任务设备进度报告
    socket.on('batch:device_progress', (data) => {
      try {
        if (!data || typeof data !== 'object') {
          return
        }

        const { taskId, deviceId, progress, currentStep, totalSteps, message } = data

        // 向管理客户端广播设备进度
        socket.broadcast.emit('batch:device_progress', {
          taskId,
          deviceId,
          progress: Math.min(100, Math.max(0, progress || 0)), // 确保进度在0-100之间
          currentStep,
          totalSteps,
          message,
          timestamp: new Date().toISOString()
        })

        console.log(`🔄 批量任务设备进度: ${taskId} - ${deviceId} - ${progress}%`)

      } catch (error) {
        console.error('处理批量任务设备进度失败:', error)
      }
    })

    // 设备断开连接
    socket.on('disconnect', () => {
      console.log(`Socket 断开: ${socket.id}`)
      const deviceId = deviceManager.socketToDevice?.get?.(socket.id)
      deviceManager.disconnectDevice(socket.id)

      // 如果找到设备ID，通知其他客户端设备离线
      if (deviceId) {
        socket.broadcast.emit('device:list_changed', {
          action: 'offline',
          deviceId,
          total: deviceManager.getDeviceCount()
        })
      }
    })

    // 错误处理
    socket.on('error', (error) => {
      console.error(`Socket 错误 (${socket.id}):`, error)
    })
  })
}

/**
 * 查询设备当前版本信息
 */
async function queryDeviceVersions(deviceId) {
  try {
    console.log(`查询设备版本信息: ${deviceId}`)

    // 查询前端版本
    const frontendResult = await deviceManager.sendCommand(
      deviceId,
      'getCurrentVersion',
      {
        project: 'frontend'
      },
      10_000
    ) // 10秒超时

    // 查询后端版本
    const backendResult = await deviceManager.sendCommand(
      deviceId,
      'getCurrentVersion',
      {
        project: 'backend'
      },
      10_000
    )

    // 处理查询结果
    const versionUpdates = {}

    const frontendResponse = frontendResult?.data
    if (frontendResult.success && frontendResponse?.success && frontendResponse.data) {
      const frontendData = frontendResponse.data
      versionUpdates.frontend = {
        version: frontendData.version || null,
        deployDate: frontendData.deployTime || frontendData.deployDate || null,
        deployPath: frontendData.deployPath || null
      }
      console.log(`设备 ${deviceId} 前端版本:`, versionUpdates.frontend)
    }

    const backendResponse = backendResult?.data
    if (backendResult.success && backendResponse?.success && backendResponse.data) {
      const backendData = backendResponse.data
      versionUpdates.backend = {
        version: backendData.version || null,
        deployDate: backendData.deployTime || backendData.deployDate || null,
        deployPath: backendData.deployPath || null
      }
      console.log(`设备 ${deviceId} 后端版本:`, versionUpdates.backend)
    }

    // 更新设备版本信息到存储
    if (Object.keys(versionUpdates).length > 0) {
      for (const [project, versionInfo] of Object.entries(versionUpdates)) {
        // eslint-disable-next-line no-await-in-loop -- 顺序更新版本信息确保数据一致性
        await deviceManager.updateCurrentVersion(deviceId, project, versionInfo)
      }

      console.log(`已更新设备 ${deviceId} 的版本信息`)
    } else {
      console.log(`设备 ${deviceId} 未返回有效版本信息`)
    }
  } catch (error) {
    console.error(`查询设备版本失败 [${deviceId}]:`, error.message)
  }
}
