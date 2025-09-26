## 项目概述

远程升级系统 - 一个用于管理和远程升级设备的分布式系统，包含：

- **server-koa**: Koa.js 后端服务器
- **web-admin**: Vue.js 管理后台
- **agent-device**: Node.js 设备代理

## 通用开发规范

### 用户偏好

- 始终使用中文回复。
- 始终提供中文注释。

### 代码风格

- 使用中文注释
- 采用 camelCase 命名（避免全大写）
- 优先保证代码简洁易维护
- 遵循 KISS 原则，避免过度设计

### ES Modules 模块规范

- **重要**: 本项目使用 ES modules 语法 (`"type": "module"`)
- 必须使用 `import/export` 语法，禁止使用 `require()` 和 `module.exports`
- 脚本文件需要使用 ES modules 语法：`import { execSync } from 'child_process'`
- 需要 `__dirname` 时使用：`import { fileURLToPath } from 'url'; const __dirname = path.dirname(fileURLToPath(import.meta.url));`

## Server-Koa 后端开发规范

### API 接口开发规范

- **重要**: 每次对接口进行更改后，必须同步更新对应的 Swagger 注释
- 接口文档位于 `server-koa/src/routes/*.js` 文件中
- Swagger 注释应包含完整的请求/响应示例和参数说明
- 接口变更时需确保文档准确反映实际的数据结构

### 后端测试规范

- 每次接口变更后需要测试完整的数据流
- 确保前端-后端-设备端的数据传递正确
- 特别注意文件传输和校验逻辑

### 运行后端测试

```bash
cd server-koa
npm run test
```

### 后端常见问题排查

1. **文件校验失败**: 检查 `fileMD5` 字段是否正确传递
2. **设备升级失败**: 确认包配置文件中的 MD5 值准确
3. **接口调用异常**: 核对 Swagger 文档与实际代码的一致性

## Web-Admin 前端开发规范

### 设计原则与建议

- 遵循 KISS 原则：优先选择简单的解决方案，避免过度设计导致难以理解与维护
- 使用现代异步模式：推荐使用 Promise 和 async/await，避免使用手动状态管理
- 避免过度抽象：不要因假设或不确定的需求引入复杂性
- 及时清理资源：所有资源（如定时器、监听器、请求）都应具备明确的清理机制
- 统一错误处理：制定统一的错误捕获与处理策略，减少遗漏和不一致
- 保持代码可读性：命名清晰、注释恰当，优先保证代码易读性

### 表单数据管理最佳实践 - 工厂函数模式

- 使用 `getInitialXxxFormState()` 工厂函数返回表单初始状态，仅包含业务字段，排除系统字段（如 `id`、`created_at` 等）
- 使用 `formState.value = getInitialXxxFormState()` 进行完全重置，确保清除所有字段，包括后端返回的额外字段
- 使用 `ref(getInitialXxxFormState())` 创建响应式表单数据，确保初始化语义明确
- 使用 `Object.assign(formState.value, record)` 合并编辑数据至表单中
- 使用 `defineModel('formData')` 实现子组件双向绑定，父组件通过 `v-model:form-data` 传递数据
- 保持数据职责清晰：父组件管理表单状态和逻辑，子组件专注交互与验证

优势：清晰语义、避免数据污染、业务字段与系统字段解耦、提升新增流程的安全性和可控性

### JSDoc 注释规范

- 所有导出的函数必须使用 JSDoc 风格的注释（/\*_ ... _/）
- 注释应包含函数用途、参数类型、返回值说明
- 注释应简洁明确，避免无意义的模板内容
- 该规则适用于工具函数、服务函数、通用逻辑模块，不用于组件内部

示例：

```js
/**
 * 计算两个数之和
 * @param {number} a - 第一个数
 * @param {number} b - 第二个数
 * @returns {number} 两数之和
 */
function sum(a, b) {
  return a + b
}
```

### Vue 组件模式与组合式 API 最佳实践

#### 组件结构组织

- **`src/views`**: 页面级组件，与路由绑定
- **`src/components`**: 原子级、可高度复用的基础组件
- **页面内组件**: 在 `views` 的子目录 `components` 中，存放仅在该业务模块内部复用的组件

#### 组合式 API 规范

- 使用 `<script setup>` 与组合式 API，获得更好的类型推导和代码组织
- 为 props 声明类型与默认值，避免在子组件中直接修改 props
- 通过 `emits` 显式声明组件事件；使用 `v-model` 实现双向绑定
- 使用 `computed` 管理派生状态，`watch` 处理副作用
- 谨慎使用 provide/inject 进行深层组件通信
  - 适用：组件库封装、全局配置（如主题、语言、权限）
  - 慎用：普通业务逻辑中，易造成数据来源不清、依赖隐蔽
  - 提示：默认非响应式，需搭配 ref / reactive 使用
- 使用异步组件实现代码分割
- 使用 Vue 3.4+ 的 `defineModel` API 来实现父子组件间的双向数据绑定

#### 响应式状态管理

- 用 `ref` 管理基本类型 / 数组 / 对象引用；仅在表单场景使用 `reactive`
- 使用 `storeToRefs()` 解构 Pinia store 的响应式属性，避免 `computed(() => store.xxx)`

```js
// ✅ 推荐示例
const loading = ref(false)
const form = reactive({ name: '', email: '', age: null })

const venueStore = useVenueStore()
const { venueList, loading: storeLoading } = storeToRefs(venueStore)
```

#### 注释与生命周期规范

- 避免装饰性注释，统一简洁风格（如 `// 组件状态`）
- 为主要业务函数添加 `/** 操作说明 */` 注释
- 避免在 `onMounted` 中发起数据请求；应在 `setup` 中完成

#### Props 处理最佳实践

- 将 props 视为不可变；如需更改，通过事件通知父组件
- 必要时在子组件中用 `ref` / `computed` 创建本地副本
- 当 props 是对象或数组时，警惕嵌套属性变更带来的副作用；必要时深拷贝或拆分局部状态

### Vue Composables 使用规范

- 仅在以下两种场景下使用 Composables：
  - 需要在多个组件中复用状态化逻辑（如 ref、computed）
  - 当前组件逻辑复杂、结构混乱，需要功能性拆分
- 不应将简单、仅限当前组件的逻辑提取为 Composables，避免过度设计
- Composables 是为"逻辑复用"或"组件简化"而设计，应避免滥用

### 前端运行测试

```bash
cd web-admin
npm run dev
```

## Agent-Device 设备端开发规范

### 设备代理规范

- 设备代理负责与服务器通信和本地文件管理
- 核心逻辑位于 `src/core/` 目录
- 服务模块位于 `src/services/` 目录

### 设备端测试

```bash
cd agent-device
npm run test
```

## 全局维护指南

### 版本管理

- 每次功能变更都需要更新相关文档
- 保持代码、注释、文档的同步更新
- 重要变更需要在项目 README 中说明

---

_此文档会随项目发展持续更新，请确保所有开发者都能访问到最新版本。_
