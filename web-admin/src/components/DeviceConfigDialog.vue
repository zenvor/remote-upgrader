<template>
  <a-modal
    v-model:open="open"
    :title="dialogTitle"
    :width="480"
    :maskClosable="false"
    @cancel="cancel"
    @ok="handleSubmit"
    :confirm-loading="loading"
    ok-text="保存配置"
    cancel-text="取消"
  >
    <a-space direction="vertical" size="large" style="width: 100%">
      <a-form ref="formRef" :model="formData" :rules="formRules" layout="vertical" @submit.prevent="handleSubmit">
        <a-form-item label="原部署目录路径" name="deployPath">
          <a-input
            v-model:value="formData.deployPath"
            placeholder="例如: /opt/frontend 或 /var/www/html"
            ref="deployPathInput"
          />
        </a-form-item>
      </a-form>
    </a-space>
  </a-modal>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import toast from '@/utils/toast'
import { useDevices } from '@/composables/useDevices'

// Props - 接收设备信息
const props = defineProps({
  device: {
    type: Object,
    default: null
  }
})

// 使用 defineModel 实现 v-model 双向绑定
const open = defineModel('open', { type: Boolean, default: false })

const emit = defineEmits(['success'])

// 内部表单数据管理
const formData = ref({
  deployPath: ''
})

// 响应式引用
const loading = ref(false)
const deployPathInput = ref()
const formRef = ref()
const formRules = {
  deployPath: [
    { required: true, message: '原部署目录路径不能为空', trigger: 'blur' },
    {
      validator: (_, value) => {
        if (!value) return Promise.resolve()
        const v = String(value).trim()
        if (!v.startsWith('/')) return Promise.reject('路径必须以 / 开头')
        if (v.includes('..') || /\s/.test(v)) return Promise.reject('路径不能包含 ".." 或空格字符')
        return Promise.resolve()
      },
      trigger: 'blur',
    },
  ],
}

// 监听设备变化，初始化表单数据
watch(() => props.device, (newDevice) => {
  if (newDevice) {
    formData.value = {
      deployPath: newDevice.deployPath || ''
    }
  }
}, { immediate: true })

// 监听对话框打开状态，重置表单验证
watch(() => open.value, (isOpen) => {
  if (isOpen && props.device) {
    formData.value = {
      deployPath: props.device.deployPath || ''
    }
  }
  if (!isOpen) {
    // 关闭时清除验证状态
    formRef.value?.clearValidate()
  }
})

// 计算属性
const dialogTitle = computed(() => {
  return props.device ? `配置原部署目录路径 - ${props.device.deviceName}` : '配置原部署目录路径'
})

const handleSubmit = async () => {
  if (!props.device) return
  
  try {
    await formRef.value?.validate()
    loading.value = true
    const deployPath = (formData.value.deployPath || '').trim()
    const { setDeviceDeployPath } = useDevices()
    await setDeviceDeployPath(props.device.deviceId, deployPath)
    toast.success(`设备 "${props.device.deviceName}" 的原部署目录路径配置成功`, '配置保存')
    emit('success')
    cancel()
  } catch (error) {
    console.error('保存配置失败:', error)
    toast.error(`保存配置失败: ${error.message}`, '配置错误')
  } finally {
    loading.value = false
  }
}

const cancel = () => {
  open.value = false
  formRef.value?.clearValidate()
}
</script>
