<template>
  <div class="page-container">
     <!-- 统计概览 -->
     <a-row :gutter="16" style="margin-bottom: 24px">
        <a-col :xs="12" :sm="8" :md="8" :lg="8" :xl="8">
          <a-card :bordered="false">
            <div class="flex items-center">
              <CloudOutlined class="mr-2 text-blue-600" />
              <div>
                <div class="text-gray-500">前端包</div>
                <div class="text-xl font-semibold">{{ packageStats.frontend }}</div>
              </div>
            </div>
          </a-card>
        </a-col>
        <a-col :xs="12" :sm="8" :md="8" :lg="8" :xl="8">
          <a-card :bordered="false">
            <div class="flex items-center">
              <HddOutlined class="mr-2 text-green-600" />
              <div>
                <div class="text-gray-500">后端包</div>
                <div class="text-xl font-semibold">{{ packageStats.backend }}</div>
              </div>
            </div>
          </a-card>
        </a-col>
        <a-col :xs="12" :sm="8" :md="8" :lg="8" :xl="8">
          <a-card :bordered="false">
            <div class="flex items-center">
              <CloudOutlined class="mr-2 text-orange-600" />
              <div>
                <div class="text-gray-500">总存储</div>
                <div class="text-xl font-semibold">{{ formatFileSize(packageStats.totalSize) }}</div>
              </div>
            </div>
          </a-card>
        </a-col>
      </a-row>
    
    <a-card :bordered="false" :bodyStyle="{ padding: '0 20px' }">
      <OperationBar
        :title="'包管理'"
        :selected-count="0"
        :total="packages.length"
        :show-total="true"
        @refresh="refreshPackages"
      >
      </OperationBar>

      <!-- 上传新包 -->
      <a-card title="上传新包" :bordered="false" size="small" class="info-card">
        <!-- 拖拽上传区域 -->
        <a-upload-dragger
          v-model:file-list="fileList"
          name="file"
          :multiple="false"
          :before-upload="beforeUpload"
          @change="handleUploadChange"
          @drop="handleDrop"
          accept=".zip,.tar.gz,.rar,.7z"
          :show-upload-list="false"
          class="upload-area"
        >
          <p class="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p class="ant-upload-text">点击或拖拽文件到此区域上传</p>
          <p class="ant-upload-hint">
            支持 .zip, .tar.gz, .rar, .7z 格式，最大 500MB
          </p>
        </a-upload-dragger>

        <!-- 已选择文件信息 -->
        <div v-if="uploadSelectedFile" class="selected-file">
          <a-descriptions size="small" :column="2">
            <a-descriptions-item label="文件名" :span="2">
              {{ uploadSelectedFile.name }}
              <a-tag :color="uploadSelectedFile.size > 500 * 1024 * 1024 ? 'red' : 'green'" class="ml-2">
                {{ uploadSelectedFile.size > 500 * 1024 * 1024 ? '文件过大' : '已选择' }}
              </a-tag>
            </a-descriptions-item>
            <a-descriptions-item label="文件大小">
              {{ formatFileSize(uploadSelectedFile.size) }}
            </a-descriptions-item>
            <a-descriptions-item label="MD5校验">
              <span v-if="calculatingMD5">
                <a-spin size="small" /> 计算中...
              </span>
              <span v-else-if="uploadFileMD5" class="md5-text">{{ uploadFileMD5 }}</span>
              <span v-else class="text-gray-500">待计算</span>
            </a-descriptions-item>
          </a-descriptions>
          
          <!-- 操作按钮 -->
          <div class="upload-actions">
            <a-space>
              <a-select
                v-model:value="uploadProject"
                :options="uploadProjectOptions"
                placeholder="请选择项目类型"
                style="width: 150px"
              />
              <a-button type="primary" :disabled="!canStartUpload" :loading="uploading" @click="handleUploadStart">
                <UploadOutlined />
                开始上传
              </a-button>
              <a-button @click="clearUploadSelectedFile">
                <CloseOutlined />
                清除
              </a-button>
            </a-space>
          </div>
        </div>
      </a-card>

      <!-- 上传进度 -->
      <a-card v-if="showProgress" title="上传进度" :bordered="false" size="small" class="info-card">
        <div class="upload-progress">
          <a-progress :percent="uploadProgress" :format="formatProgressInfo" />
        </div>
        <div class="progress-info">
          <a-space>
            <span>{{ formatFileSize(uploadStatus.loaded) }}/{{ formatFileSize(uploadStatus.fileSize) }}</span>
            <span>{{ formatSpeed(uploadStatus.speed) }}</span>
            <span>剩余时间: {{ formatTime(uploadStatus.eta) }}</span>
            <a-tag :color="uploadStatus.status === '上传中' ? 'processing' : 'default'">{{ uploadStatus.status }}</a-tag>
          </a-space>
        </div>
        <div class="progress-actions">
          <a-space>
            <a-button danger @click="cancelUpload">
              <CloseOutlined />
              取消
            </a-button>
          </a-space>
        </div>
      </a-card>

      <!-- 包列表 -->
      <a-card title="包列表" :bordered="false" size="small" class="info-card">
        <a-table
          :dataSource="packages"
          :columns="pkgColumnsAntd"
          :loading="loading"
          rowKey="id"
          :pagination="{ pageSize: 20, pageSizeOptions: ['10','20','50'], showSizeChanger: true, showQuickJumper: true }"
          size="small"
        >
          <!-- 在表格内部渲染操作列 -->
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'actions'">
              <a-space>
                <a-button size="small" @click="showPackageDetails(record)">
                  <EyeOutlined />
                  详情
                </a-button>
                <a-button size="small" @click="downloadPackage(record)">
                  <DownloadOutlined />
                  下载
                </a-button>
                <a-button size="small" danger @click="deletePackage(record)">
                  <DeleteOutlined />
                  删除
                </a-button>
              </a-space>
            </template>
          </template>
        </a-table>
      </a-card>
    </a-card>

    <!-- 包详情对话框（AntD Modal） -->
    <a-modal
      v-model:open="packageDetailVisible"
      :title="`包详情 - ${selectedPackage?.fileName}`"
      :width="960"
      :maskClosable="false"
    >
      <a-space v-if="selectedPackage" direction="vertical" size="large" style="width: 100%">
        <!-- 基本信息和完整性信息 -->
        <a-row :gutter="16">
          <a-col :span="12">
            <a-card title="基本信息">
              <a-space direction="vertical" size="small" style="width: 100%">
                <a-space align="center" style="width: 100%; justify-content: space-between;">
                  <span class="text-gray-500">文件名</span>
                  <span>{{ selectedPackage.fileName }}</span>
                </a-space>
                <a-space align="center" style="width: 100%; justify-content: space-between;">
                  <span class="text-gray-500">项目类型</span>
                  <a-tag :color="selectedPackage.project === 'frontend' ? 'blue' : 'green'">
                    {{ getProjectLabel(selectedPackage.project) }}
                  </a-tag>
                </a-space>
                <a-space align="center" style="width: 100%; justify-content: space-between;">
                  <span class="text-gray-500">文件大小</span>
                  <span>{{ formatFileSize(selectedPackage.fileSize) }}</span>
                </a-space>
                <a-space align="center" style="width: 100%; justify-content: space-between;">
                  <span class="text-gray-500">上传者</span>
                  <span>{{ selectedPackage.uploader || '未知' }}</span>
                </a-space>
              </a-space>
            </a-card>
          </a-col>
          
          <a-col :span="12">
            <a-card title="完整性信息">
              <a-space direction="vertical" size="small" style="width: 100%">
                <a-space align="start" style="width: 100%; justify-content: space-between;">
                  <span class="text-gray-500">MD5校验</span>
                  <a-tag style="font-family: monospace; font-size: 12px; word-break: break-all; max-width: 200px">
                    {{ selectedPackage.fileMD5 }}
                  </a-tag>
                </a-space>
                <a-space v-if="selectedPackage.fileSHA256" align="start" style="width: 100%; justify-content: space-between;">
                  <span class="text-gray-500">SHA256</span>
                  <a-tag style="font-family: monospace; font-size: 12px; word-break: break-all; max-width: 200px">
                    {{ selectedPackage.fileSHA256 }}
                  </a-tag>
                </a-space>
                <a-space align="center" style="width: 100%; justify-content: space-between;">
                  <span class="text-gray-500">分片数量</span>
                  <span>{{ selectedPackage.totalChunks || '未知' }}</span>
                </a-space>
                <a-space align="center" style="width: 100%; justify-content: space-between;">
                  <span class="text-gray-500">分片大小</span>
                  <span>{{ formatFileSize(selectedPackage.chunkSize || 0) }}</span>
                </a-space>
              </a-space>
            </a-card>
          </a-col>
        </a-row>

        <!-- Manifest信息 -->
        <a-card v-if="selectedPackage.manifest" title="Manifest信息">
          <a-textarea 
            :value="JSON.stringify(selectedPackage.manifest, null, 2)"
            readonly
            :autoSize="{ minRows: 6, maxRows: 16 }"
            style="font-family: monospace; font-size: 12px"
          />
        </a-card>

        <!-- 部署历史 -->
        <a-card title="部署历史">
          <a-table
            :dataSource="packageDeployHistory"
            :columns="deployHistoryColumns"
            :loading="loadingDeployHistory"
            size="small"
            rowKey="deviceId"
            :pagination="packageDeployHistory.length > 10 ? { pageSize: 10 } : false"
          />
        </a-card>
      </a-space>

      <template #footer>
        <a-space>
          <a-button @click="downloadPackage(selectedPackage)"><DownloadOutlined /> 下载</a-button>
          <a-button @click="packageDetailVisible = false">关闭</a-button>
        </a-space>
      </template>
    </a-modal>


  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, h } from 'vue'
import { Modal } from 'ant-design-vue'
import { usePackages } from '@/composables/usePackages'
import { useUpload } from '@/composables/useUpload'
import toast from '@/utils/toast'
import { 
  UploadOutlined,
  CloseOutlined,
  CloudOutlined,
  HddOutlined,
  DownloadOutlined,
  InboxOutlined,
  EyeOutlined,
  DeleteOutlined
} from '@ant-design/icons-vue'
import OperationBar from '@/components/OperationBar.vue'

// 数据状态
const {
  packages,
  loading,
  packageDeployHistory,
  loadingDeployHistory,
  fetchPackages,
  deletePackage: deletePackageAPI,
  getPackageDeployHistory
} = usePackages()

// 已移除：筛选功能
// 移除基于上传时间的视图模式
const packageDetailVisible = ref(false)
const selectedPackage = ref(null)

// 已移除：筛选选项

// 视图模式选择已移除

// 计算属性
const packageStats = computed(() => {
  const frontend = packages.value.filter(p => p.project === 'frontend').length
  const backend = packages.value.filter(p => p.project === 'backend').length
  const totalSize = packages.value.reduce((sum, p) => sum + (p.fileSize || 0), 0)
  return { frontend, backend, totalSize }
})

// 已移除：本地筛选，直接使用 packages

// 方法
const refreshPackages = async () => {
  await fetchPackages()
}
// 已移除：查询与重置逻辑

// === 上传相关（合并自上传管理） ===
const fileList = ref([])
const uploadSelectedFile = ref(null)
const uploadProject = ref(null)
const uploadFileMD5 = ref(null)
const uploading = ref(false)

// 进度条显示控制
const showProgress = ref(false)
const progressStartTime = ref(null)
const MIN_PROGRESS_DISPLAY_TIME = 1500 // 最小显示时间1.5秒

const {
  uploadStatus,
  calculatingMD5,
  calculateFileHash,
  startUpload,
  cancelUpload,
  formatFileSize,
  formatSpeed,
  formatTime
} = useUpload()

const uploadProjectOptions = [
  { label: '前端项目', value: 'frontend' },
  { label: '后端项目', value: 'backend' }
]

// 已移除分片相关常量

const canStartUpload = computed(() => {
  return uploadSelectedFile.value && uploadProject.value && !uploading.value
})

const uploadProgress = computed(() => {
  if (!uploadStatus.value.active) return 0
  return uploadStatus.value.progress || 0
})

/**
 * 进度条显示格式：统一一位小数
 */
const formatProgressInfo = (percent) => {
  const value = typeof percent === 'number' ? percent : Number(percent)
  if (Number.isNaN(value)) return '0.0%'
  return `${value.toFixed(1)}%`
}

const onUploadFileSelect = async (event) => {
  const file = event.files[0]
  if (file.size > 500 * 1024 * 1024) {
    toast.error('文件大小不能超过 500MB', '文件过大')
    return
  }
  const allowedExtensions = ['.zip', '.tar.gz', '.rar', '.7z']
  const fileName = file.name.toLowerCase()
  const isValidType = allowedExtensions.some(ext => fileName.endsWith(ext))
  if (!isValidType) {
    toast.error('请选择支持的压缩文件格式 (.zip, .tar.gz, .rar, .7z)', '文件格式不支持')
    return
  }
  uploadSelectedFile.value = file
  calculateUploadMD5()
}

// 拖拽上传处理函数
const beforeUpload = (file) => {
  // 阻止自动上传，我们需要手动控制
  return false
}

const handleUploadChange = (info) => {
  if (info.file) {
    onUploadFileSelect({ files: [info.file] })
  }
}

const handleDrop = (e) => {
  console.log('文件拖拽事件:', e)
}

const clearUploadSelectedFile = () => {
  uploadSelectedFile.value = null
  uploadFileMD5.value = null
  uploadProject.value = null
  fileList.value = []
  // 重置进度显示状态
  showProgress.value = false
  progressStartTime.value = null
}

const calculateUploadMD5 = async () => {
  if (!uploadSelectedFile.value) return
  try {
    uploadFileMD5.value = 'calculating...'
    const md5 = await calculateFileHash(uploadSelectedFile.value)
    uploadFileMD5.value = md5
    toast.success('文件 MD5 计算完成', 'MD5 计算')
  } catch (error) {
    console.error('MD5计算失败:', error)
    uploadFileMD5.value = '计算失败'
    toast.error(`MD5 计算失败: ${error.message}`, 'MD5 计算')
  }
}


const handleUploadStart = async () => {
  if (!canStartUpload.value) return
  uploading.value = true
  try {
    await startUpload(uploadSelectedFile.value, uploadProject.value)
    // 上传成功后清理文件选择
    clearUploadSelectedFile()
  } catch (error) {
    console.error('上传失败:', error)
  } finally {
    uploading.value = false
  }
}

watch(uploadStatus, async (val, oldVal) => {
  // 当上传开始时，延迟显示进度条
  if (val.active && !oldVal?.active) {
    progressStartTime.value = Date.now()
    // 延迟300ms显示进度条，避免对于很快完成的上传显示进度条
    setTimeout(() => {
      if (uploadStatus.value.active) {
        showProgress.value = true
      }
    }, 300)
  }
  
  // 当上传完成时，确保最小显示时间
  if (!val.active && (val.status === '已完成' || val.status === '秒传完成')) {
    const elapsedTime = Date.now() - (progressStartTime.value || 0)
    const remainingTime = Math.max(0, MIN_PROGRESS_DISPLAY_TIME - elapsedTime)
    
    // 如果显示时间不足最小时间，延迟隐藏
    setTimeout(() => {
      showProgress.value = false
      fetchPackages()
    }, remainingTime)
  }
  
  // 当上传被取消或失败时，立即隐藏
  if (!val.active && (val.status === '已取消' || val.status === '上传失败')) {
    showProgress.value = false
  }
}, { deep: true })

const showPackageDetails = async (pkg) => {
  selectedPackage.value = pkg
  packageDetailVisible.value = true
  
  // 获取部署历史
  await getPackageDeployHistory(pkg.project, pkg.fileName)
}

const downloadPackage = (pkg) => {
  const url = `/api/packages/${pkg.project}/${pkg.fileName}/download`
  window.open(url, '_blank')
}


const deployHistoryColumns = [
  { key: 'deviceName', dataIndex: 'deviceName', title: '设备名称' },
  { key: 'deployTime', dataIndex: 'deployTime', title: '部署时间', customRender: ({ record }) => formatDate(record.deployTime) },
  { key: 'status', dataIndex: 'status', title: '状态', customRender: ({ record }) => h('a-tag', { color: record.status === 'success' ? 'green' : 'red' }, () => record.status) },
  { key: 'deployer', dataIndex: 'deployer', title: '操作者' }
]

// AntD 表格列配置
const pkgColumnsAntd = [
  {
    key: 'fileName',
    dataIndex: 'fileName',
    title: '包名称',
    customRender: ({ record }) => h('div', { class: 'flex items-center space-x-3' }, [
      h(record.project === 'frontend' ? CloudOutlined : (record.project === 'backend' ? HddOutlined : CloudOutlined), { 
        class: record.project === 'frontend' ? 'text-lg text-blue-600' : (record.project === 'backend' ? 'text-lg text-green-600' : 'text-lg text-gray-600')
      }),
      h('div', null, [
        h('div', { class: 'font-medium text-gray-900' }, record.fileName),
        h('div', { class: 'text-sm text-gray-500' }, record.version || '未知版本')
      ])
    ])
  },
  {
    key: 'project',
    dataIndex: 'project',
    title: '项目',
    customRender: ({ record }) => {
      // 调试：打印record数据结构
      console.log('Package record:', record)
      if (!record.project) {
        return h('a-tag', { color: 'default' }, () => '未分类')
      }
      return h('a-tag', { color: record.project === 'frontend' ? 'blue' : 'green' }, () => getProjectLabel(record.project))
    }
  },
  {
    key: 'fileSize',
    dataIndex: 'fileSize',
    title: '文件大小',
    customRender: ({ record }) => formatFileSize(record.fileSize)
  },
  {
    key: 'fileMD5',
    dataIndex: 'fileMD5',
    title: 'MD5校验',
    customRender: ({ record }) => h('div', { class: 'font-mono text-xs text-gray-600 max-w-32 truncate', title: record.fileMD5 }, record.fileMD5)
  },
  {
    key: 'deployCount',
    dataIndex: 'deployCount',
    title: '部署次数',
    customRender: ({ record }) => h('span', { class: 'text-lg font-bold text-blue-600' }, record.deployCount || 0)
  },
  {
    key: 'actions',
    title: '操作',
    width: 240,
    // 操作列改由表格内部插槽渲染
  }
]


const deletePackage = (pkg) => {
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除包 "${pkg.fileName}" 吗？此操作不可恢复。`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        await deletePackageAPI(pkg.project, pkg.fileName)
        await fetchPackages()
      } catch (error) {
        console.error('删除包失败:', error)
      }
    }
  })
}



// 工具方法
const getProjectLabel = (project) => {
  return project === 'frontend' ? '前端项目' : '后端项目'
}


// 格式化函数已移至 useUpload 中

const formatDate = (timestamp) => {
  return new Date(timestamp).toLocaleString('zh-CN')
}

// 生命周期
onMounted(() => {
  fetchPackages()
})
</script>

<style scoped lang="less">
.info-card {
  margin-bottom: 16px;
  
  :deep(.ant-card-head) {
    background: #fafafa;
  }
}

.upload-area {
  :deep(.ant-upload-drag) {
    border: 1px dashed #d9d9d9;
    border-radius: 6px;
    
    &:hover {
      border-color: #1890ff;
    }
  }
}

.selected-file {
  margin-top: 16px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 6px;
  border: 1px solid #e9ecef;
  
  .md5-text {
    font-family: monospace;
    font-size: 12px;
    color: #52c41a;
  }
  
  .upload-actions {
    margin-top: 12px;
    display: flex;
    justify-content: flex-end;
  }
}

.upload-progress {
  overflow: hidden;
  
  :deep(.ant-progress) {
    max-width: 100%;
    
    .ant-progress-outer {
      padding-right: 60px; // 为百分比文字预留空间
    }
    
    .ant-progress-text {
      position: absolute;
      right: 0;
      top: 50%;
      transform: translateY(-50%);
      white-space: nowrap;
      font-size: 12px;
      color: #666;
      min-width: 50px;
      text-align: right;
    }
  }
}

.progress-info {
  margin: 12px 0;
  font-size: 13px;
  color: #666;
}

.progress-actions {
  margin-top: 12px;
  text-align: right;
}

.ml-2 {
  margin-left: 8px;
}

.text-gray-500 {
  color: #8c8c8c;
}
</style>
