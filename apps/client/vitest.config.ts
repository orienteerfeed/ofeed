import react from '@vitejs/plugin-react-swc';
import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',

    // Test files OUTSIDE src
    include: [
      'tests/**/*.{test,spec}.{js,ts,tsx}',
      '**/__tests__/**/*.{js,ts,tsx}',
    ],
    exclude: [
      'src/**', // Explicitly exclude src
      'node_modules/**',
      'dist/**',
    ],

    coverage: {
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'src/main.tsx',
        'src/vite-env.d.ts',
        'tests/**',
        '**/*.config.*',
      ],
    },
  },

  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@/test-utils': resolve(__dirname, './tests/utils'),
    },
  },
});
