import pluginJs from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import mocha from 'eslint-plugin-mocha'; // Ensure eslint-plugin-mocha is installed
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/', 'dist/', 'coverage/', '*.min.js'], // Add your ignore patterns here
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.mocha, // Add Mocha globals
      },
    },
  },
  pluginJs.configs.recommended,
  {
    plugins: {
      mocha: mocha, // Ensure eslint-plugin-mocha is installed
      import: importPlugin,
    },
    rules: {
      // Add custom rules here
      'linebreak-style': ['error', 'unix'],
      'mocha/no-exclusive-tests': 'error', // Example custom rule
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'import/order': [
        'warn',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
          ],
          alphabetize: { order: 'asc', caseInsensitive: true },
          'newlines-between': 'always',
        },
      ],
    },
  },
];
