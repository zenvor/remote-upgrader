import request from '../request'

/**
 * 包管理相关 API
 * 基于实际的后端接口：/packages, /packages/:project/:fileName, /packages/:project/:fileName/download
 */

// 获取包列表
export const getPackageList = (params = {}) => {
  return request.get('/packages', params)
}

// 获取包详细信息
export const getPackageDetail = (project, fileName) => {
  return request.get(`/packages/${project}/${fileName}`)
}

// 下载包
export const downloadPackage = (project, fileName) => {
  return request.get(
    `/packages/${project}/${fileName}/download`,
    null,
    { responseType: 'blob' }
  )
}

// 删除包
export const deletePackage = (project, fileName) => {
  return request.delete(`/packages/${project}/${fileName}`)
}
