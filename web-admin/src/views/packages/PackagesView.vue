<template>
  <div class="page-container">
    <!-- 统计概览组件 -->
    <PackageStatsCards :stats="packageStats" />

    <!-- 上传新包组件 -->
    <PackageUploadCard @upload-success="refreshPackages" />

    <!-- 包列表 -->
    <a-card :bordered="false" size="small" class="info-card" :body-style="{ padding: '0 20px' }">
      <OperationBar
        :title="'包管理'"
        size="small"
        :selected-count="0"
        :total="total"
        :show-total="true"
        @refresh="fetchPackages"
      >
        <template #actions>
          <a-select
            v-model:value="queryParams.project"
            allow-clear
            placeholder="项目类型"
            :options="projectOptions"
            style="width: 200px"
            @change="fetchPackages"
          />
        </template>
      </OperationBar>

      <!-- 包列表表格组件 -->
      <PackageTable
        :packages="packages"
        :loading="loading"
        @show-details="showPackageDetails"
        @delete-package="handleDeletePackage"
      />
    </a-card>

    <!-- 包详情对话框组件 -->
    <PackageDetailModal
      v-model:open="packageDetailVisible"
      :selected-package="selectedPackage"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import OperationBar from '@/components/OperationBar.vue'
import { packageApi } from '@/api'
import toast from '@/utils/toast'
import PackageDetailModal from './components/PackageDetailModal.vue'
import PackageStatsCards from './components/PackageStatsCards.vue'
import PackageTable from './components/PackageTable.vue'
import PackageUploadCard from './components/PackageUploadCard.vue'

// 数据状态
const packages = ref([])
const loading = ref(false)
const packageDetailVisible = ref(false)
const selectedPackage = ref(null)

// 项目筛选
const projectOptions = [
  { label: '前端项目', value: 'frontend' },
  { label: '后端项目', value: 'backend' }
]
const queryParams = ref({
  project: null
})

// 计算属性
const packageStats = computed(() => {
  const frontend = packages.value.filter((p) => p.project === 'frontend').length
  const backend = packages.value.filter((p) => p.project === 'backend').length
  const totalSize = packages.value.reduce((sum, p) => sum + (p.fileSize || 0), 0)
  return { frontend, backend, totalSize }
})

const total = computed(() => packages.value.length)

// 方法
/** 获取包列表 */
const fetchPackages = async () => {
  loading.value = true
  try {
    const response = await packageApi.getPackageList(queryParams.value)
    packages.value = response.packages
  } catch (error) {
    console.error('获取包列表失败:', error)
    toast.error(error.message || '获取包列表失败', '包列表')
  } finally {
    loading.value = false
  }
}

/** 删除包 */
const deletePackageAPI = async (project, fileName) => {
  try {
    await packageApi.deletePackage(project, fileName)

    // 从本地列表中移除
    packages.value = packages.value.filter((pkg) => !(pkg.project === project && pkg.fileName === fileName))

    toast.success(`包 "${fileName}" 删除成功`, '删除成功')
  } catch (error) {
    console.error('删除包失败:', error)
    toast.error(`删除包失败: ${error.message}`, '删除失败')
    throw error
  }
}

const refreshPackages = async () => {
  try {
    await fetchPackages()
  } catch (error) {
    console.error('刷新包列表失败:', error)
  }
}

const showPackageDetails = async (pkg) => {
  selectedPackage.value = pkg
  packageDetailVisible.value = true
}

const handleDeletePackage = async (pkg) => {
  try {
    await deletePackageAPI(pkg.project, pkg.fileName)
    await fetchPackages()
  } catch (error) {
    console.error('删除包失败:', error)
  }
}

// 初始化数据
fetchPackages()
</script>

<style scoped lang="less">
.page-container {
  padding: 24px;
}

.info-card {
  margin-bottom: 16px;

  :deep(.ant-card-head) {
    background: #fafafa;
  }
}
</style>