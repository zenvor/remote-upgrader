import request from '../request'

/**
 * 设备管理相关 API
 * 基于实际的后端接口：/devices, /devices/:deviceId, /devices/:deviceId/command
 */

// 获取设备列表
export const getDeviceList = (params = {}) => {
  return request.get('/devices', params)
}

// 获取设备详细信息
export const getDeviceDetail = (deviceId) => {
  return request.get(`/devices/${deviceId}`)
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

// 回滚设备
export const rollbackDevice = (deviceId, project = null) => {
  return request.post(`/devices/${deviceId}/command`, {
    command: 'cmd:rollback',
    data: { project }
  })
}

// 重启设备服务
export const restartDevice = (deviceId, service = 'all') => {
  return request.post(`/devices/${deviceId}/command`, {
    command: 'cmd:restart',
    data: { service }
  })
}

// 获取设备的原部署目录路径配置
export const getDeviceDeployPath = (deviceId) => {
  return request.get(`/devices/${deviceId}/deploy-path`)
}

// 设置设备的原部署目录路径配置
export const setDeviceDeployPath = (deviceId, deployPath) => {
  return request.post(`/devices/${deviceId}/deploy-path`, {
    deployPath
  })
}
