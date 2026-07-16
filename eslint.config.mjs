import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig({
  files: ['**/*.{js,ts}'],
  ignores: ['dist/**'],
  extends: [
    js.configs.recommended,
    tseslint.configs.strict,
    tseslint.configs.stylistic,
  ],
  rules: {
    '@typescript-eslint/no-inferrable-types': 'error',
  },
});
