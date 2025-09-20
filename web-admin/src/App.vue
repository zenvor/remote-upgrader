<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const active = computed(() => route.path)

const goto = (path) => router.push(path)
</script>

<template>
  <a-config-provider :component-size="'middle'">
    <div class="app-container">
      <div class="app-header">
        <div class="brand">
          <span class="app-title">远程升级系统</span>
        </div>
        <a-menu mode="horizontal" :selectedKeys="[active]" @click="({ key }) => goto(key)">
          <a-menu-item key="/devices">设备管理</a-menu-item>
          <a-menu-item key="/packages">包管理</a-menu-item>
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
  padding: 32px 16px;
}
</style>
