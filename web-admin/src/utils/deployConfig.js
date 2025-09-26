/**
 * 从设备列表中解析指定项目的部署路径
 * @param {Array} devices - 设备列表
 * @param {string} project - 项目类型 frontend/backend
 * @returns {string|null}
 */
export function resolveDeviceDeployPath(devices, project) {
  if (!project || !Array.isArray(devices) || devices.length === 0) return null
  const primary = devices[0]
  if (!primary || !primary.deviceId) return null

  const deployPaths = primary?.deploy?.currentDeployPaths || primary?.deployInfo?.deployPaths || {}
  const fallback = project === 'frontend' ? primary?.frontendDeployPath : primary?.backendDeployPath

  const candidates = [deployPaths?.[project], fallback]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim()
    }
  }

  return null
}

/**
 * 从设备列表中解析指定项目的保护文件白名单
 * @param {Array} devices - 设备列表
 * @param {string} project - 项目类型 frontend/backend
 * @returns {string[]}
 */
export function resolveDevicePreservedPaths(devices, project) {
  if (!project || !Array.isArray(devices) || devices.length === 0) return []
  const primary = devices[0]
  if (!primary || !primary.deviceId) return []

  const preservedPaths = primary?.preservedPaths || {}
  const paths = preservedPaths?.[project]?.paths || preservedPaths?.[project] || []

  return Array.isArray(paths) ? paths : []
}

/**
 * 从环境变量获取项目的保护文件配置
 * @param {'frontend'|'backend'} project - 项目类型
 * @returns {string[]} 保护文件路径数组
 */
export function getEnvPreservedPaths(project) {
  if (!project) return []

  let envVar
  switch (project) {
    case 'frontend':
      envVar = import.meta.env.VITE_FRONTEND_PRESERVED_PATHS
      break
    case 'backend':
      envVar = import.meta.env.VITE_BACKEND_PRESERVED_PATHS
      break
    default:
      return []
  }

  if (!envVar || typeof envVar !== 'string') {
    return []
  }

  // 分割字符串，过滤空值，去除首尾空格
  return envVar
    .split(',')
    .map(path => path.trim())
    .filter(path => path.length > 0)
}

/**
 * 合并保护文件配置
 * 优先级：后端数据 > 环境变量配置
 * @param {'frontend'|'backend'} project - 项目类型
 * @param {string[]} [backendPaths] - 后端返回的保护文件配置
 * @returns {string[]} 最终的保护文件配置
 */
export function getMergedPreservedPaths(project, backendPaths = null) {
  // 如果后端有返回数据，优先使用后端数据
  if (backendPaths && Array.isArray(backendPaths) && backendPaths.length > 0) {
    console.log(`使用后端返回的 ${project} 保护文件配置:`, backendPaths)
    return backendPaths
  }

  // 否则使用环境变量配置
  const envPaths = getEnvPreservedPaths(project)
  if (envPaths.length > 0) {
    console.log(`使用环境变量中的 ${project} 保护文件配置:`, envPaths)
    return envPaths
  }

  console.log(`没有找到 ${project} 项目的保护文件配置`)
  return []
}

/**
 * 检查是否有保护文件配置
 * @param {'frontend'|'backend'} project - 项目类型
 * @param {string[]} [backendPaths] - 后端返回的保护文件配置
 * @returns {boolean} 是否有配置
 */
export function hasPreservedPathsConfig(project, backendPaths = null) {
  const mergedPaths = getMergedPreservedPaths(project, backendPaths)
  return mergedPaths.length > 0
}

/**
 * 获取保护文件配置的来源说明
 * @param {'frontend'|'backend'} project - 项目类型
 * @param {string[]} [backendPaths] - 后端返回的保护文件配置
 * @returns {string} 配置来源说明
 */
export function getPreservedPathsSource(project, backendPaths = null) {
  if (backendPaths && Array.isArray(backendPaths) && backendPaths.length > 0) {
    return '后端配置'
  }

  const envPaths = getEnvPreservedPaths(project)
  if (envPaths.length > 0) {
    return '环境变量'
  }

  return '无配置'
}
