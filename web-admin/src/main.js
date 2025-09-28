import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import 'ant-design-vue/dist/reset.css'
import './style.less'
import App from './App.vue'

const routes = [
  { path: '/', redirect: '/packages' },
  { path: '/devices', component: () => import('./views/devices/DevicesView.vue') },
  { path: '/packages', component: () => import('./views/packages/PackagesView.vue') },
  { path: '/batch-tasks', component: () => import('./views/batch-tasks/BatchTaskView.vue') }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

const app = createApp(App)

app.use(router)
// 直接挂载应用
app.mount('#app')
