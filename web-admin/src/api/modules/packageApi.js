import request from '../request.js'

/**
 * 包管理相关 API
 * 基于实际的后端接口：/packages, /packages/:project/:fileName, /packages/:project/:fileName/download
 */

// 获取包列表
export const getPackageList = (parameters = {}) => {
  return request.get('/packages', parameters)
}

// 获取包详细信息
export const getPackageDetail = (project, fileName) => {
  return request.get(`/packages/${project}/${fileName}`)
}

// 下载包
export const downloadPackage = (project, fileName) => {
  return request.get(`/packages/${project}/${fileName}/download`, null, { responseType: 'blob' })
}

// 删除包
export const deletePackage = (project, fileName) => {
  return request.delete(`/packages/${project}/${fileName}`)
}

/** 获取包列表（升级选择专用） */
export const getPackageListForUpgrade = (parameters = {}) => {
  return request.get('/packages/list', parameters)
}
