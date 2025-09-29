import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { AntDesignVueResolver } from 'unplugin-vue-components/resolvers'
import Components from 'unplugin-vue-components/vite'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 使用 loadEnv 读取 .env 文件，确保 base 可按环境切换
  const env = loadEnv(mode, process.cwd(), '')
  const base = env.VITE_APP_BASE_PATH || '/'

  return {
    base,
    server: {
      port: env.APP_PORT ? Number(env.APP_PORT) : 3000
    },
    build: {
      outDir: '../server-koa/public/webadmin'
    },
    plugins: [
      vue(),
      Components({
        resolvers: [
          AntDesignVueResolver({
            // 关闭子包样式导入，改用全量 antd.css
            importStyle: false
          })
        ]
      })
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      }
    }
  }
})
