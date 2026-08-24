module.exports = {
  root: true,
  env: { browser: true, es2022: true, webextensions: true, node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  settings: { react: { version: '18.3' } },
  ignorePatterns: ['dist', 'node_modules', 'coverage', 'playwright-report', 'test-results'],
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    // Правила безопасности из docs/security.md — код от AI не выполняется никогда.
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
  overrides: [
    {
      files: ['tests/**/*.ts', 'tests/**/*.tsx', '*.config.ts', 'scripts/**/*.mjs'],
      rules: { 'no-console': 'off', '@typescript-eslint/no-explicit-any': 'off' },
    },
    {
      // В фикстурах Playwright есть колбэк `use(...)`, который плагин React
      // принимает за хук.
      files: ['tests/e2e/**/*.ts'],
      rules: { 'react-hooks/rules-of-hooks': 'off' },
    },
  ],
};
