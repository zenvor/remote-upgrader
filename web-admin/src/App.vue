<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const active = computed(() => {
  const currentPath = route.path
  if (currentPath.startsWith('/devices')) {
    return '/devices'
  }
  if (currentPath.startsWith('/packages')) {
    return '/packages'
  }
  if (currentPath.startsWith('/batch-tasks')) {
    return '/batch-tasks'
  }
  return currentPath
})

const goto = (path) => router.push(path)
</script>

<template>
  <a-config-provider :component-size="'middle'">
    <div class="app-container">
      <div class="app-header">
        <div class="brand">
          <span class="app-title">远程升级系统</span>
        </div>
        <a-menu mode="horizontal" :selected-keys="[active]" @click="({ key }) => goto(key)">
          <a-menu-item key="/devices">设备管理</a-menu-item>
          <a-menu-item key="/packages">包管理</a-menu-item>
          <a-menu-item key="/batch-tasks">任务管理中心</a-menu-item>
        </a-menu>
      </div>

      <main class="app-main">
        <router-view />
      </main>
    </div>
  </a-config-provider>
</template>

<style lang="less" scoped>
.app-container {
  min-height: 100vh;
  background-color: #f6f7fb;
}
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: #fff;
  border-bottom: 1px solid #f0f0f0;
}
.app-title {
  font-size: 18px;
  font-weight: 700;
  color: #1f2937;
}
.app-main {
  margin: 0 auto;
}
</style>
