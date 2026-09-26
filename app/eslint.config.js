import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    // android/ 下这三处全是构建产物（gradle 的 intermediates、cap sync 生成的
    // 前端副本），不是源码。不排除它们，`npm run lint` 会被几千条产物报错淹掉。
    ignores: [
      'dist',
      'node_modules',
      'coverage',
      // EdgeOne 部署的工作目录（部署工具把 dist 拷进来，压缩产物不是源码）。
      '.edgeone',
      'android/build',
      'android/app/build',
      'android/app/src/main/assets/public',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
)
