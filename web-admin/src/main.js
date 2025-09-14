import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import 'ant-design-vue/dist/reset.css';
import './style.less'

import App from './App.vue'
import { initRealtime } from '@/services/realtime'

const routes = [
  { path: '/', redirect: '/packages' },
  { path: '/devices', component: () => import('./views/DevicesView.vue') },
  { path: '/packages', component: () => import('./views/PackagesView.vue') }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})


const app = createApp(App)

app.use(router)
// 直接挂载应用
app.mount('#app')

// 初始化全局实时连接（应用启动即建立，路由切换不丢失）
initRealtime()
