import 'ant-design-vue/dist/reset.css'
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import './style.less'

const routes = [
  { path: '/', redirect: '/packages' },
  { path: '/devices', component: () => import('./views/devices/DevicesView.vue') },
  { path: '/packages', component: () => import('./views/packages/PackagesView.vue') },
  { path: '/batch-tasks', component: () => import('./views/batch-tasks/BatchTaskView.vue') }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.VITE_APP_BASE_PATH || '/'),
  routes
})

const app = createApp(App)

app.use(router)
// 直接挂载应用
app.mount('#app')
