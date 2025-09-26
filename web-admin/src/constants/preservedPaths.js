// 常用的部署白名单路径选项
export const COMMON_PRESERVED_PATH_OPTIONS = [
  { label: '.env - 环境配置文件', value: '.env' },
  { label: 'config/ - 配置目录', value: 'config/' },
  { label: 'logs/ - 日志目录', value: 'logs/' },
  { label: 'storage/ - 存储目录', value: 'storage/' },
  { label: 'data/ - 数据目录', value: 'data/' },
  { label: 'uploads/ - 上传目录', value: 'uploads/' },
  { label: 'public/ - 静态资源目录', value: 'public/' },
  { label: 'vendor/ - 依赖包目录', value: 'vendor/' },
  { label: 'node_modules/ - Node 依赖', value: 'node_modules/' },
  { label: 'database/ - 数据库文件目录', value: 'database/' }
]
