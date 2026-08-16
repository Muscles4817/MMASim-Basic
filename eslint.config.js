import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/*.tsbuildinfo'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          // Determinism is the foundation of the long-sim suite and of re-watchable fights.
          // See docs/01-architecture.md § Determinism.
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message: 'Use a seeded Rng (core/rng.ts). Math.random breaks determinism.',
        },
      ],
    },
  },
  {
    // The engine is the strictest layer: pure, no I/O, no ambient time, no upward imports.
    files: ['packages/engine/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'The engine performs no I/O.' },
        { name: 'localStorage', message: 'The engine performs no I/O.' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@mmasim/data', '@mmasim/app'], message: 'The engine imports nothing.' },
          ],
        },
      ],
    },
  },
  {
    // Time is measured in integer game days; `Date` is allowed only in the clock adapter,
    // which converts at the boundary and is covered by tests.
    files: ['packages/engine/src/**/*.ts'],
    ignores: ['packages/engine/src/core/clock.ts', '**/*.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'Use GameDay integers from core/clock.ts.' },
      ],
    },
  },
  {
    files: ['**/*.test.ts', 'tests/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
);
