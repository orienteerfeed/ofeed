import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react-swc';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import checker from 'vite-plugin-checker';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react() as any,
    checker({
      typescript: true,
    }) as any,
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
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
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
