// eslint.config.mjs — Node + Koa + ESM（Flat Config）
import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import pluginImport from 'eslint-plugin-import'
import n from 'eslint-plugin-n'
import promise from 'eslint-plugin-promise'
import globals from 'globals'

export default [
  // 忽略文件模式（优化：使用 globstar 和更精确的匹配）
  {
    ignores: [
      '**/node_modules/**',
      '**/logs/**',
      '**/deployed/**',
      '**/downloads/**',
      '**/backup/**',
      '**/coverage/**',
      '**/tmp/**',
      '**/dist/**',
      '**/public/**',
      '**/uploads/**',
      '**/*.config.cjs',
      '**/ecosystem.config.cjs',
      '**/eslint.config.mjs',
      '**/.eslintcache'
    ]
  },

  // JS 推荐配置
  js.configs.recommended,

  // Node 插件推荐配置（Flat）
  n.configs['flat/recommended'],

  // Promise 插件推荐配置（Flat）
  promise.configs['flat/recommended'],

  // 语言环境与常用规则（优化：支持更多文件扩展名，添加 Node.js 版本配置）
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      sourceType: 'module',
      ecmaVersion: 'latest',
      globals: { ...globals.node }
    },
    settings: {
      node: {
        version: '>=18.0.0' // 根据项目需求配置 Node.js 版本
      }
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'warn',
      reportUnusedInlineConfigs: 'warn'
    },
    plugins: {
      import: pluginImport
    },
    rules: {
      'no-console': 'off', // 服务端允许日志
      'no-unused-vars': 'error',
      'no-unused-expressions': 'error',
      'no-control-regex': 'off', // 允许控制字符正则表达式（用于文件名安全处理）
      'prefer-const': 'error',
      'no-var': 'error',
      'no-await-in-loop': 'warn' // 警告在循环中使用 await
    }
  },

  // 构建脚本/配置文件：常见地允许 dev 依赖等（视需要增删）
  {
    files: ['**/scripts/**', '**/ecosystem.config.cjs', '**/eslint.config.mjs'],
    rules: {
      'n/no-unpublished-import': 'off',
      'n/no-unpublished-require': 'off'
    }
  },

  // 让 Prettier 接管风格
  prettier
]
