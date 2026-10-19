import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.tmp-build/**', '**/generated/**'] },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.eslintRecommended],
    languageOptions: { parser: tseslint.parser },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      // The TypeScript-aware rule understands interfaces, parameter properties
      // and type-only imports. Keep Prettier responsible for style.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'no-debugger': 'error',
      'no-constant-binary-expression': 'error',
    },
  },
);
