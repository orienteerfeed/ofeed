import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react-swc';
import { createRequire } from 'node:module';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import checker from 'vite-plugin-checker';
import { VitePWA } from 'vite-plugin-pwa';
import svgr from 'vite-plugin-svgr';

const require = createRequire(import.meta.url);
const rootPackage = require('../../package.json');

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(rootPackage.version),
  },
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react() as any,
    svgr(),
    checker({
      typescript: true,
    }) as any,
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}', '**/pwa-*.png'],
        globIgnores: ['**/images/placeholders/**'],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 24 * 60 * 60 }, // 60 days
            },
          },
        ],
      },
      manifest: {
        name: 'OrienteerFeed - Live Orienteering Platform',
        short_name: 'OFeed',
        description:
          'Real-time orienteering results, splits analysis, and event management platform',
        theme_color: '#2e7d32',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        categories: ['sports', 'entries', 'events', 'results'],
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
        shortcuts: [
          {
            name: 'Live Results',
            short_name: 'Results',
            description: 'View live race results',
            url: '/results',
            icons: [{ src: '/icons/results-96x96.png', sizes: '96x96' }],
          },
          {
            name: 'Events',
            short_name: 'Events',
            description: 'Browse upcoming events',
            url: '/events',
            icons: [{ src: '/icons/events-96x96.png', sizes: '96x96' }],
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3000,
    strictPort: true,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Reduce that ~1.56 MB chunk by splitting vendors
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('react')) return 'react';
          if (id.includes('@tanstack')) return 'tanstack';
          if (id.includes('@radix-ui')) return 'radix';
          if (id.includes('recharts')) return 'recharts';
          if (id.includes('@apollo')) return 'apollo';
          return 'vendor';
        },
      },
    },
  },
});
