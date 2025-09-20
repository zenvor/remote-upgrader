import globals from 'globals'

/** @type {import('xo').FlatXoConfig} */
export default [
  // 忽略（服务端常见输出目录也一并忽略）
  {
    ignores: [
      'node_modules/**',
      'logs/**',
      'deployed/**',
      'downloads/**',
      'backup/**',
      'coverage/**',
      'tmp/**',
      '*.config.cjs',
      'ecosystem.config.cjs'
    ]
  },

  // XO 主体（含 Prettier 集成与基本风格）
  {
    prettier: true,
    space: true,
    semicolon: false,
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.node } // Node 环境全局（process, Buffer, __dirname等ESM自定义场景）
    },
    rules: {
      'no-console': 'off' // 允许服务端日志
    }
  },

  // 对构建/脚本文件放宽对 devDependencies 的限制（避免 CI/脚本报错）
  {
    files: ['scripts/**', 'ecosystem.config.cjs'],
    rules: {
      'import/no-extraneous-dependencies': 'off'
    }
  }
]
