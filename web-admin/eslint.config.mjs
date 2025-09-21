// eslint.config.mjs — Vue3 + Vite + JS（Flat Config）
import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

export default [
  // 忽略文件模式（优化：使用 globstar 和更精确的匹配）
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/logs/**', '**/vite.config.*', '**/.eslintcache']
  },

  // JS 推荐配置
  js.configs.recommended,

  // Vue3 推荐配置（Flat 展开）
  ...pluginVue.configs['flat/recommended'],

  // JavaScript 文件配置（优化：支持更多文件扩展名）
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      sourceType: 'module',
      ecmaVersion: 'latest',
      globals: {
        ...globals.browser
      }
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'warn',
      reportUnusedInlineConfigs: 'warn'
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': 'error',
      'no-unused-expressions': 'error',
      'prefer-const': 'error',
      'no-var': 'error'
    }
  },

  // Vue 文件特殊处理（优化：保持现有配置）
  {
    files: ['**/*.vue'],
    languageOptions: {
      sourceType: 'module',
      ecmaVersion: 'latest',
      globals: {
        ...globals.browser,
        // Vue 3 编译器宏，避免 no-undef（<script setup>）
        defineProps: 'readonly',
        defineEmits: 'readonly',
        defineExpose: 'readonly',
        withDefaults: 'readonly',
        defineSlots: 'readonly',
        defineModel: 'readonly'
      }
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'warn',
      reportUnusedInlineConfigs: 'warn'
    },
    rules: {
      'no-console': 'off',
      'vue/multi-word-component-names': 'off',
      'no-unused-vars': 'error',
      'prefer-const': 'error',
      'no-var': 'error',

      // Vue 样式和最佳实践规则
      'vue/html-closing-bracket-spacing': ['error', {
        startTag: 'never',
        endTag: 'never',
        selfClosingTag: 'never'
      }],
      'vue/mustache-interpolation-spacing': ['error', 'always'],
      'vue/attribute-hyphenation': ['error', 'always', {
        ignore: ['data-*', 'aria-*']
      }],
      'vue/no-multi-spaces': 'error',
      'vue/singleline-html-element-content-newline': ['error', {
        ignoreWhenNoAttributes: true
      }]
    }
  },

  // 交给 Prettier 管风格（必须在最后）
  prettier
]
