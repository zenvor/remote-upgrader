import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

/** @type {import('xo').FlatXoConfig} */
export default [
  // 忽略
  {
    ignores: ['node_modules/**', 'dist/**', 'logs/**', '*.config.cjs', 'ecosystem.config.cjs', 'vite.config.js']
  },

  // XO 主体（含 Prettier 集成 & 风格）
  {
    prettier: true,
    space: true,
    semicolon: false,
    // 让项目默认具备"浏览器"环境（给 src 下的 JS 也注入 window/document 等）
    // 等价于老版 XO 的 "browser": true
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.browser }
    }
  },

  // Vue 3 flat 预设（官方推荐写法，需展开）
  ...pluginVue.configs['flat/recommended'],

  // .vue 里再补充/覆写一些规则（可按需调整）
  {
    files: ['**/*.vue'],
    rules: {
      'vue/multi-word-component-names': 'off' // 允许单词组件名
      // 'vue/no-v-html': 'off',                 // 如果你需要用 v-html 再打开
      // 'vue/html-indent': ['error', 2],        // 如需强制缩进
    }
  }
]
