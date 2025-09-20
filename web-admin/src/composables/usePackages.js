import { ref } from 'vue'
import { packageApi, deviceApi } from '@/api'
import toast from '@/utils/toast'

export function usePackages() {
  const packages = ref([])
  const total = ref(0)
  const selectedPackages = ref([])
  const loading = ref(false)
  const refreshing = ref(false)
  const packageDeployHistory = ref([])
  const loadingDeployHistory = ref(false)
  const filtersState = ref({ project: 'all' })

  // 统一整理包信息，避免前端反复判空
  const normalizePackage = (pkg = {}) => {
    const project = pkg.project || 'frontend'
    const fileName = pkg.fileName || 'unknown-package.zip'
    return {
      ...pkg,
      project,
      fileName,
      id: `${project}_${fileName}`,
      fileSize: typeof pkg.fileSize === 'number' ? pkg.fileSize : 0,
      fileMD5: pkg.fileMD5 || null,
      packagePath: pkg.packagePath || '',
      manifestPath: pkg.manifestPath || null,
      manifest: pkg.manifest || null,
      version: pkg.version || null,
      uploadedAt: pkg.uploadedAt || null,
      uploadedBy: pkg.uploadedBy || pkg.uploader || null,
      uploader: pkg.uploadedBy || pkg.uploader || null,
      deployCount: typeof pkg.deployCount === 'number' ? pkg.deployCount : 0,
      chunkSize: typeof pkg.chunkSize === 'number' ? pkg.chunkSize : 0,
    }
  }

  // 获取包列表
  const fetchPackages = async (filters = {}) => {
    loading.value = true
    try {
      const query = {}
      const projectFilter = filters.project ?? filtersState.value.project ?? 'all'
      if (projectFilter && projectFilter !== 'all') {
        query.project = projectFilter
      }

      const response = await packageApi.getPackageList(query)

      if (response && response.success === false) {
        throw new Error(response.error || response.message || '获取包列表失败')
      }

      const packageList = Array.isArray(response?.packages) ? response.packages.map(normalizePackage) : []
      packages.value = packageList
      total.value = typeof response?.total === 'number' ? response.total : packageList.length
      filtersState.value = { project: projectFilter }

      return {
        packages: packageList,
        total: total.value,
        project: projectFilter,
      }
    } catch (error) {
      console.error('获取包列表失败:', error)
      toast.error(error.message || '获取包列表失败', '包列表')
      packages.value = []
      return {
        packages: [],
        total: 0,
        project: projectFilter,
      }
    } finally {
      loading.value = false
    }
  }

  // 刷新包列表
  const refreshPackages = async () => {
    refreshing.value = true
    try {
      await fetchPackages({ project: filtersState.value.project })
    } finally {
      refreshing.value = false
    }
  }

  // 获取包详细信息
  const getPackageDetail = async (project, fileName) => {
    try {
      const response = await packageApi.getPackageDetail(project, fileName)
      return response
    } catch (error) {
      console.error('获取包详情失败:', error)
      throw error
    }
  }

  // 下载包
  const downloadPackage = async (project, fileName) => {
    try {
      const response = await packageApi.downloadPackage(project, fileName)
      
      // 创建下载链接
      const url = window.URL.createObjectURL(new Blob([response]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', fileName)
      document.body.appendChild(link)
      link.click()
      
      // 清理
      window.URL.revokeObjectURL(url)
      document.body.removeChild(link)
    } catch (error) {
      console.error('下载包失败:', error)
      throw error
    }
  }

  // 删除包
  const deletePackage = async (project, fileName) => {
    try {
      await packageApi.deletePackage(project, fileName)
      
      // 从本地列表中移除
      packages.value = packages.value.filter(
        pkg => !(pkg.project === project && pkg.fileName === fileName)
      )
      
      toast.success(`包 "${fileName}" 删除成功`, '删除成功')
    } catch (error) {
      console.error('删除包失败:', error)
      toast.error(`删除包失败: ${error.message}`, '删除失败')
      throw error
    }
  }

  // 批量删除包
  const batchDeletePackages = async (packageList) => {
    const promises = packageList.map(pkg => 
      packageApi.deletePackage(pkg.project, pkg.fileName)
    )

    try {
      await Promise.all(promises)
      
      // 从本地列表中移除
      packageList.forEach(pkg => {
        packages.value = packages.value.filter(
          p => !(p.project === pkg.project && p.fileName === pkg.fileName)
        )
      })
      
      toast.success(`批量删除完成，共 ${packageList.length} 个包`, '批量删除成功')
    } catch (error) {
      console.error('批量删除失败:', error)
      toast.error(`批量删除失败: ${error.message}`, '批量删除失败')
      throw error
    }
  }

  // 部署包到设备
  const deployPackageToDevices = async (packageInfo, deviceList, options = {}) => {
    try {
      // 发送升级命令到所有目标设备
      const upgradePromises = deviceList.map(device =>
        deviceApi.upgradeDevice(device.deviceId, {
          project: packageInfo.project,
          fileName: packageInfo.fileName,
          version: packageInfo.version,
          fileMD5: packageInfo.fileMD5,
          deployPath: options.deployPath || undefined
        })
      )

      await Promise.all(upgradePromises)

      const message = `包 "${packageInfo.fileName}" 部署任务已启动，目标设备: ${deviceList.length} 个`
      toast.success(message, '部署启动成功')

      // 返回部署结果
      return { deviceCount: deviceList.length }

    } catch (error) {
      console.error('部署包到设备失败:', error)
      toast.error(`部署失败: ${error.message}`, '部署失败')
      throw error
    }
  }

  // 获取包部署历史（模拟数据）
  const getPackageDeployHistory = async (project, fileName) => {
    loadingDeployHistory.value = true
    try {
      // TODO: 实现获取包部署历史的API
      // 目前返回模拟数据
      packageDeployHistory.value = [
        {
          deviceId: 'device-001',
          deviceName: '生产服务器01',
          deployTime: Date.now() - 86400000, // 1天前
          status: 'success',
          deployer: 'admin',
          version: '1.2.0'
        },
        {
          deviceId: 'device-002',
          deviceName: '测试服务器01',
          deployTime: Date.now() - 3600000, // 1小时前
          status: 'success',
          deployer: 'admin',
          version: '1.2.0'
        }
      ]
    } catch (error) {
      console.error('获取部署历史失败:', error)
    } finally {
      loadingDeployHistory.value = false
    }
  }

  return {
    packages,
    total,
    selectedPackages,
    loading,
    refreshing,
    packageDeployHistory,
    loadingDeployHistory,
    filters: filtersState,
    fetchPackages,
    refreshPackages,
    getPackageDetail,
    downloadPackage,
    deletePackage,
    batchDeletePackages,
    deployPackageToDevices,
    getPackageDeployHistory
  }
}
