import request from '../request.js'

/**
 * 设备管理相关 API
 * 基于实际的后端接口：/devices, /devices/:deviceId, /devices/:deviceId/command
 */

// 获取设备列表
export const getDeviceList = (parameters = {}) => {
  return request.get('/devices', parameters)
}

// 获取单个设备信息（使用设备列表接口的筛选功能）
export const getDeviceDetail = (deviceId) => {
  // 使用设备列表接口来获取单个设备信息
  return request
    .get('/devices', {
      search: deviceId,
      pageSize: 1
    })
    .then((response) => {
      if (response.devices && response.devices.length > 0) {
        const device = response.devices[0]
        // 只返回精确匹配的设备
        if (device.deviceId === deviceId) {
          return { device }
        }
      }

      throw new Error('设备不存在')
    })
}

// 发送设备命令
export const sendDeviceCommand = (deviceId, command, data = {}) => {
  return request.post(`/devices/${deviceId}/command`, {
    command,
    data
  })
}

// 升级设备
export const upgradeDevice = (deviceId, upgradeData) => {
  return request.post(`/devices/${deviceId}/command`, {
    command: 'cmd:upgrade',
    data: upgradeData
  })
}

// 回滚设备（回退至上一个备份版本）
export const rollbackDevice = (deviceId, projectOrOptions) => {
  const payload =
    projectOrOptions && typeof projectOrOptions === 'object'
      ? projectOrOptions
      : { project: projectOrOptions }

  return request.post(`/devices/${deviceId}/command`, {
    command: 'cmd:rollback',
    data: payload
  })
}

// 重启设备服务
export const restartDevice = (deviceId, service = 'all') => {
  return request.post(`/devices/${deviceId}/command`, {
    command: 'cmd:restart',
    data: { service }
  })
}
