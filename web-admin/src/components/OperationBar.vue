<template>
  <div class="operation-bar">
    <div class="operation-bar-container">
      <!-- 左侧：标题与信息 -->
      <div class="operation-bar-left">
        <div class="operation-bar-title">
          <slot name="title">{{ title }}</slot>
        </div>

        <div class="operation-info">
          <span v-if="showTotal && total !== undefined" class="total-info"> 共 {{ total }} 条数据 </span>
          <span v-if="selectedCount > 0" class="selected-info"> 已选择 {{ selectedCount }} 项 </span>
          <slot name="info"></slot>
        </div>
      </div>

      <!-- 右侧：操作按钮区 -->
      <div class="operation-bar-right">
        <a-space :size="6">
          <slot name="actions"></slot>
          <a-tooltip v-if="showRefresh" title="刷新">
            <a-button type="text" @click="onRefresh" class="refresh-btn"><ReloadOutlined /></a-button>
          </a-tooltip>
        </a-space>
      </div>
    </div>
  </div>
  
</template>

<script setup>
import { ReloadOutlined } from '@ant-design/icons-vue'

const props = defineProps({
  title: { type: String, default: '' },
  selectedCount: { type: Number, default: 0 },
  total: { type: Number, default: undefined },
  showTotal: { type: Boolean, default: false },
  showRefresh: { type: Boolean, default: true }
})

const emit = defineEmits(['refresh'])

const onRefresh = () => emit('refresh')
</script>

<style lang="less" scoped>
.operation-bar {
  padding: 16px 0;

  &-container {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &-left {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    justify-content: flex-start;
    max-width: calc(100% - 200px);
    flex: 1;

    .operation-bar-title {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      color: rgba(0, 0, 0, 0.88);
      font-weight: 500;
      font-size: 16px;
    }
  }

  &-right {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }
}

.operation-info {
  display: flex;
  align-items: center;
  gap: 16px;
  color: #666;
  font-size: 14px;

  .total-info {
    color: rgba(0, 0, 0, 0.65);
  }

  .selected-info {
    color: #1890ff;
    background: #e6f7ff;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 500;
  }
}

.refresh-btn {
  padding: 0 4px !important;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(0, 0, 0, 0.65);
  font-size: 16px;

  &:hover {
    color: #1890ff;
    background-color: rgba(0, 0, 0, 0.04);
  }

  &:active {
    background-color: rgba(0, 0, 0, 0.06);
  }
}

@media (max-width: 768px) {
  .operation-bar {
    &-container {
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
    }
    &-left {
      max-width: 100%;
      order: 1;
    }
    &-right {
      order: 2;
      justify-content: flex-start;
    }
    .operation-info {
      justify-content: flex-end;
      margin-top: 8px;
    }
  }
}
</style>


