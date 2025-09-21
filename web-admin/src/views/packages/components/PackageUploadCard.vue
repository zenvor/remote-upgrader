<template>
  <a-card title="上传新包" size="small" :bordered="false" class="info-card" :body-style="{ padding: '20px' }">
    <!-- 上传新包 -->
    <a-upload-dragger
      v-model:file-list="fileList"
      name="file"
      :multiple="false"
      :before-upload="beforeUpload"
      accept=".zip,.tar.gz,.rar,.7z"
      :show-upload-list="false"
      class="upload-area"
      @change="handleUploadChange"
      @drop="handleDrop"
    >
      <p class="ant-upload-drag-icon">
        <InboxOutlined />
      </p>
      <p class="ant-upload-text">点击或拖拽文件到此区域上传</p>
      <p class="ant-upload-hint">支持 .zip, .tar.gz, .rar, .7z 格式，最大 500MB</p>
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
          <span v-if="calculatingMD5"> <a-spin size="small" /> 计算中... </span>
          <a-tag v-else-if="uploadFileMD5" :color="uploadFileMD5 === '计算失败' ? 'red' : 'green'">
            {{ uploadFileMD5 }}
          </a-tag>
          <span v-else class="text-gray-500">待计算</span>
        </a-descriptions-item>
        <a-descriptions-item label="版本号">
          <a-space direction="vertical" size="small" style="width: 100%">
            <a-input
              v-model:value="uploadVersion"
              placeholder="可选：例如 v1.2.3"
              style="width: 200px"
              @blur="validateVersion"
            />
            <div v-if="versionError" style="color: #ff4d4f; font-size: 12px">{{ versionError }}</div>
            <div v-else class="text-gray-500" style="font-size: 12px">留空则尝试从文件名提取，否则为 unknown</div>
          </a-space>
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

    <!-- 上传进度 -->
    <div v-if="showProgress">
      <div class="upload-progress">
        <a-progress :percent="uploadProgress" :format="formatProgressInfo" />
      </div>
      <div class="progress-info">
        <a-space>
          <span>{{ formatFileSize(uploadStatus.loaded) }}/{{ formatFileSize(uploadStatus.fileSize) }}</span>
          <span>{{ formatSpeed(uploadStatus.speed) }}</span>
          <span>剩余时间: {{ formatTime(uploadStatus.eta) }}</span>
          <a-tag :color="uploadStatus.status === '上传中' ? 'processing' : 'default'">{{
            uploadStatus.status
          }}</a-tag>
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
    </div>
  </a-card>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useUpload } from '@/composables/useUpload'
import toast from '@/utils/toast'
import { CloseOutlined, InboxOutlined, UploadOutlined } from '@ant-design/icons-vue'

// Events
const emit = defineEmits(['upload-success'])

// 上传相关状态
const fileList = ref([])
const uploadSelectedFile = ref(null)
const uploadProject = ref(null)
const uploadFileMD5 = ref(null)
const uploading = ref(false)
const uploadVersion = ref('')
const versionError = ref('')
const versionPattern =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

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

// 计算属性
const canStartUpload = computed(() => {
  const versionOk = !uploadVersion.value || versionPattern.test(uploadVersion.value.trim())
  return uploadSelectedFile.value && uploadProject.value && versionOk && !uploading.value
})

const uploadProgress = computed(() => {
  if (!uploadStatus.value.active) return 0
  return uploadStatus.value.progress || 0
})

// 方法
const validateVersion = () => {
  if (!uploadVersion.value) {
    versionError.value = ''
    return true
  }
  if (!versionPattern.test(uploadVersion.value.trim())) {
    versionError.value = '版本号不合法，示例：v1.2.3 或 1.2.3[-beta][+build]'
    return false
  }
  versionError.value = ''
  return true
}

/** 进度条显示格式：统一一位小数 */
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
  const isValidType = allowedExtensions.some((ext) => fileName.endsWith(ext))
  if (!isValidType) {
    toast.error('请选择支持的压缩文件格式 (.zip, .tar.gz, .rar, .7z)', '文件格式不支持')
    return
  }
  uploadSelectedFile.value = file
  calculateUploadMD5()
}

const beforeUpload = () => {
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
  uploadVersion.value = ''
  versionError.value = ''
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
    await startUpload(
      uploadSelectedFile.value,
      uploadProject.value,
      uploadVersion.value && uploadVersion.value.trim() ? uploadVersion.value.trim() : undefined
    )
    // 上传成功后清理文件选择
    clearUploadSelectedFile()
    emit('upload-success')
  } catch (error) {
    console.error('上传失败:', error)
  } finally {
    uploading.value = false
  }
}

// 监听上传状态变化
watch(
  uploadStatus,
  async (val, oldVal) => {
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

    // 当上传完成时，确保最小显示时间（兼容不同状态文案）
    if (!val.active && ['上传完成', '已完成', '秒传完成'].includes(val.status)) {
      const elapsedTime = Date.now() - (progressStartTime.value || 0)
      const remainingTime = Math.max(0, MIN_PROGRESS_DISPLAY_TIME - elapsedTime)

      // 如果显示时间不足最小时间，延迟隐藏
      setTimeout(() => {
        showProgress.value = false
        emit('upload-success')
      }, remainingTime)
    }

    // 当上传被取消或失败时，立即隐藏
    if (!val.active && (val.status === '已取消' || val.status === '上传失败')) {
      showProgress.value = false
    }
  },
  { deep: true }
)
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
  margin: 16px 0;
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