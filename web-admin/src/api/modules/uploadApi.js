import request from '../request'

/**
 * 上传管理相关 API - 简化版
 * 使用直接上传替代复杂的分片上传
 */

// 直接上传文件
export const directUpload = (file, project, onProgress, abortController = null) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('project', project)

  const config = {
    headers: {
      'Content-Type': 'multipart/form-data'
    },
    timeout: 300000, // 5分钟超时，适应大文件
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
        onProgress({
          loaded: progressEvent.loaded,
          total: progressEvent.total,
          progress
        })
      }
    }
  }

  // 如果提供了取消控制器，添加到配置中
  if (abortController) {
    config.signal = abortController.signal
  }

  return request.post('/upload/direct', formData, config)
}

// 获取上传历史（复用现有包管理接口）
export const getUploadHistory = () => {
  return request.get('/packages')
}
