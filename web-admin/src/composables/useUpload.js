import { ref } from 'vue'
import { uploadApi, packageApi } from '@/api'
import { calculateFileMD5 } from '@/utils/crypto'
import toast from '@/utils/toast'

export function useUpload() {
  const uploadStatus = ref({
    active: false,
    fileName: '',
    fileSize: 0,
    loaded: 0,
    progress: 0,
    speed: 0,
    eta: 0,
    status: '准备中'
  })

  const uploadHistory = ref([])
  const calculatingMD5 = ref(false)
  let currentUploadController = null // 用于取消上传

  // 计算文件 MD5（可选，用于前端验证）
  const calculateFileHash = async (file) => {
    calculatingMD5.value = true
    uploadStatus.value.status = '计算MD5中'

    try {
      const md5 = await calculateFileMD5(file, () => {
        // MD5 计算进度（如需要可在这里更新UI）
      })

      uploadStatus.value.status = '准备中'
      return md5
    } catch (error) {
      console.error('MD5计算失败:', error)
      uploadStatus.value.status = 'MD5计算失败'
      throw error
    } finally {
      calculatingMD5.value = false
    }
  }

  // 开始上传（简化版）
  // 中文注释：支持可选的 version 参数
  const startUpload = async (file, project, version) => {
    // 重置上传状态
    uploadStatus.value = {
      active: true,
      fileName: file.name,
      fileSize: file.size,
      loaded: 0,
      progress: 0,
      speed: 0,
      eta: 0,
      status: '上传中'
    }

    // 创建取消控制器
    currentUploadController = new AbortController()

    const startTime = Date.now()
    let lastTime = startTime
    let lastLoaded = 0

    try {
      const response = await uploadApi.directUpload(
        file,
        project,
        version,
        (progressEvent) => {
          const now = Date.now()
          const timeDiff = (now - lastTime) / 1000 // 秒
          const loadedDiff = progressEvent.loaded - lastLoaded

          // 计算速度（字节/秒）
          const speed = timeDiff > 0 ? loadedDiff / timeDiff : 0

          // 计算剩余时间（秒）
          const remaining = progressEvent.total - progressEvent.loaded
          const eta = speed > 0 ? remaining / speed : 0

          uploadStatus.value = {
            ...uploadStatus.value,
            loaded: progressEvent.loaded,
            progress: progressEvent.progress,
            speed,
            eta
          }

          lastTime = now
          lastLoaded = progressEvent.loaded
        },
        currentUploadController
      )

      // 上传成功
      uploadStatus.value.status = '上传完成'
      uploadStatus.value.active = false

      // 显示成功消息
      toast.success(`文件 ${file.name} 上传成功！`, '上传成功')

      return { success: true, message: '上传完成', data: response }
    } catch (error) {
      console.error('上传失败:', error)

      if (error.name === 'AbortError' || error.code === 'CANCELED') {
        uploadStatus.value.status = '已取消'
        toast.info('上传已取消', '取消上传')
      } else {
        uploadStatus.value.status = '上传失败'
        toast.error(`上传失败: ${error.message}`, '上传错误')
      }

      uploadStatus.value.active = false
      throw error
    } finally {
      currentUploadController = null
    }
  }

  // 取消上传
  const cancelUpload = () => {
    if (currentUploadController) {
      currentUploadController.abort()
      uploadStatus.value = {
        active: false,
        fileName: '',
        fileSize: 0,
        loaded: 0,
        progress: 0,
        speed: 0,
        eta: 0,
        status: '已取消'
      }
    }
  }

  // 获取上传历史
  const fetchUploadHistory = async () => {
    try {
      const response = await packageApi.getPackageList()
      const packages = response?.packages || []
      uploadHistory.value = packages.map((item) => ({
        ...item,
        status: '已完成'
      }))
    } catch (error) {
      console.error('获取上传历史失败:', error)
      uploadHistory.value = []
    }
  }

  // 格式化文件大小
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / k ** i).toFixed(2)) + ' ' + sizes[i]
  }

  // 格式化速度
  const formatSpeed = (bytesPerSecond) => {
    return formatFileSize(bytesPerSecond) + '/s'
  }

  // 格式化时间
  const formatTime = (seconds) => {
    if (seconds === Infinity || isNaN(seconds)) return '--'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return {
    // 状态
    uploadStatus,
    uploadHistory,
    calculatingMD5,

    // 方法
    calculateFileHash,
    startUpload,
    cancelUpload,
    fetchUploadHistory,

    // 工具函数
    formatFileSize,
    formatSpeed,
    formatTime
  }
}
