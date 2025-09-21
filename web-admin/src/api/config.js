// 获取 URL 详细信息的函数
function getUrlDetails(url) {
  try {
    const urlObject = new URL(url)
    return {
      hostname: urlObject.hostname,
      port: urlObject.port || (urlObject.protocol === 'http:' ? 80 : urlObject.protocol === 'https:' ? 443 : null),
      protocol: urlObject.protocol,
      pathname: urlObject.pathname,
      host: urlObject.host,
      hash: urlObject.hash,
      search: urlObject.search
    }
  } catch (error) {
    console.error('Invalid URL:', error)
    return null
  }
}

const API_URL = import.meta.env.VITE_APP_API_URL
let { protocol } = location
let { host } = location

let { hostname } = location
const BASE_URL = API_URL || `${protocol}//${host}`

// 从 BASE_URL 获取详细信息
const urlDetails = getUrlDetails(BASE_URL)

if (urlDetails) {
  protocol = urlDetails.protocol
  hostname = urlDetails.hostname
  host = urlDetails.host
}

// 设置 WebSocket 协议和端口
const wsProtocol = BASE_URL.includes('https:') ? 'wss:' : 'ws:'

// 导出需要的配置
export { BASE_URL, hostname, host, protocol, wsProtocol }
