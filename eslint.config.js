import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Ignore generated/non-source directories
  {
    ignores: ['build/**', 'package/**', 'coverage/**', 'node_modules/**'],
  },

  // Base JS recommended rules
  eslint.configs.recommended,

  // Node.js globals for build scripts
  {
    files: ['src/zip.js'],
    languageOptions: {
      globals: { process: 'readonly', __dirname: 'readonly' },
    },
  },

  // TypeScript recommended rules for source and test files
  {
    files: ['src/**/*.ts', 'test/**/*.ts', '*.ts'],
    extends: tseslint.configs.recommended,
    rules: {
      // Allow 'any' in limited cases — the codebase uses it for browser API responses
      '@typescript-eslint/no-explicit-any': 'warn',
      // Allow unused vars prefixed with _ (convention used in callbacks)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // console.log is used extensively for debug output in an extension context
      'no-console': 'off',
    },
  },
);
