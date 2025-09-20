import axios from 'axios'
import { BASE_URL } from './config'
// 仅在业务层展示消息，这里不直接引入 UI 组件，避免重复弹窗

// 默认配置
const defaultConfig = {
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
}

// 创建 axios 实例
const createAxiosInstance = (config = {}) => {
  const instance = axios.create({
    ...defaultConfig,
    ...config
  })

  return instance
}

// 错误信息处理
const handleError = (message) => {
  if (message === 'Network Error') {
    return '后端接口连接异常'
  } else if (message.includes('timeout')) {
    return '系统接口请求超时'
  } else if (message.includes('请求失败，状态码错误')) {
    return '系统接口 ' + message.substr(message.length - 3) + ' 异常'
  }
  return message
}

// 错误状态码映射
const errorCode = {
  400: '请求参数错误',
  401: '未授权，请重新登录',
  403: '权限不足，拒绝访问',
  404: '请求的资源不存在',
  405: '请求方法不被允许',
  408: '请求超时',
  500: '服务器内部错误',
  501: '服务未实现',
  502: '网关错误',
  503: '服务不可用',
  504: '网关超时',
  505: 'HTTP版本不受支持',
  default: '未知错误'
}

// 统一的错误处理
const errorHandler = (error) => {
  // 记录错误日志
  console.error('请求错误:', error)

  // 判断是否是 HTTP 响应错误
  if (error.response) {
    const status = error.response.status
    const { data, config } = error.response

    // 记录详细的 HTTP 错误信息
    console.error('HTTP 错误详情:', {
      status,
      url: config?.url,
      method: config?.method,
      data: data,
      headers: config?.headers
    })

    // 通用错误处理：优先使用后端返回的错误信息
    const message = data?.message || data?.error || errorCode[status] || '未知错误'
    console.error('HTTP Error Message:', message)
    // 不在此处弹出消息，统一由业务层决定是否展示
    // 归一化错误消息，便于业务层直接使用 error.message
    error.message = message
    error.friendlyMessage = message
  } else {
    // 非 HTTP 响应错误（如网络断开、超时等）
    const message = handleError(error.message)
    console.error('Network Error:', {
      message: error.message,
      handledMessage: message,
      config: error.config
    })
    // 同样不直接弹出，由业务层处理
    error.message = message
    error.friendlyMessage = message
  }

  return Promise.reject(error)
}

// 请求拦截器
const requestInterceptor = (config) => {
  // 如果需要认证功能，可以在这里添加 Token
  // const token = localStorage.getItem('token')
  // if (token) {
  //   config.headers.Authorization = `Bearer ${token}`
  // }
  return config
}

// 响应拦截器
const responseInterceptor = (response) => {
  const { responseType } = response.request

  // 处理文件下载类响应
  if (['blob', 'arraybuffer'].includes(responseType)) {
    return response.data
  }

  // 如果响应数据有特定的结构，可以在这里处理
  // 目前直接返回响应数据，让业务代码自己处理
  return response.data
}

// Axios 工厂函数
const createRequest = (config) => {
  const instance = createAxiosInstance(config)

  // 添加请求拦截器
  instance.interceptors.request.use(requestInterceptor, errorHandler)

  // 添加响应拦截器
  instance.interceptors.response.use(responseInterceptor, errorHandler)

  return instance
}

// 封装请求模块
const request = {
  /**
   * 发送 GET 请求
   * @param {string} url - 请求路径
   * @param {object} [params] - 查询参数
   * @param {import('axios').AxiosRequestConfig} [config] - Axios 可选配置
   * @returns {Promise<any>} 响应数据
   */
  get: (url, params, config = {}) => {
    const instance = createRequest(config)
    return instance.get(url, { params })
  },

  /**
   * 发送 POST 请求
   * @param {string} url - 请求路径
   * @param {any} data - 请求体数据
   * @param {import('axios').AxiosRequestConfig} [config] - Axios 可选配置
   * @returns {Promise<any>} 响应数据
   */
  post: (url, data, config = {}) => {
    const instance = createRequest(config)
    return instance.post(url, data)
  },

  /**
   * 发送 PUT 请求
   * @param {string} url - 请求路径
   * @param {any} data - 请求体数据
   * @param {import('axios').AxiosRequestConfig} [config] - Axios 可选配置
   * @returns {Promise<any>} 响应数据
   */
  put: (url, data, config = {}) => {
    const instance = createRequest(config)
    return instance.put(url, data)
  },

  /**
   * 发送 DELETE 请求
   * @param {string} url - 请求路径
   * @param {any} data - 请求体数据（部分服务端实现需要）
   * @param {import('axios').AxiosRequestConfig} [config] - Axios 可选配置
   * @returns {Promise<any>} 响应数据
   */
  delete: (url, data, config = {}) => {
    const instance = createRequest(config)
    return instance.delete(url, { data })
  },

  // 支持多实例创建
  /**
   * 创建独立的请求实例
   * @param {import('axios').AxiosRequestConfig} config - Axios 实例配置
   * @returns {import('axios').AxiosInstance} Axios 实例
   */
  createInstance: (config) => {
    return createRequest(config)
  },

  // 支持请求取消
  /**
   * 取消请求（兼容旧用法）
   * @deprecated 建议改用 AbortController 进行请求取消
   * @param {Function} cancelToken - 取消令牌函数
   * @returns {any} SDK 返回值
   */
  cancelRequest: (cancelToken) => {
    const instance = createRequest()
    return instance.cancelToken(cancelToken)
  }
}

export default request
