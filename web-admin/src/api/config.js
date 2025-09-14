// 获取 URL 详细信息的函数
function getUrlDetails(url) {
  try {
    const urlObj = new URL(url)
    return {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'http:' ? 80 : urlObj.protocol === 'https:' ? 443 : null),
      protocol: urlObj.protocol,
      pathname: urlObj.pathname,
      host: urlObj.host,
      hash: urlObj.hash,
      search: urlObj.search
    }
  } catch (error) {
    console.error('Invalid URL:', error)
    return null
  }
}

const API_URL = import.meta.env.VITE_APP_API_URL
let protocol = location.protocol
let host = location.host

let hostname = location.hostname
let BASE_URL = API_URL || `${protocol}//${host}`

// 从 BASE_URL 获取详细信息
const urlDetails = getUrlDetails(BASE_URL)

if (urlDetails) {
  protocol = urlDetails.protocol
  hostname = urlDetails.hostname
  host = urlDetails.host
}

// 设置 WebSocket 协议和端口
let wsProtocol = BASE_URL.includes('https:') ? 'wss:' : 'ws:'

// 导出需要的配置
export { BASE_URL, hostname, host, protocol, wsProtocol }
