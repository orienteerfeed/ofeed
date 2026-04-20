import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import Unocss from 'unocss/vite'
import presetWind3 from '@unocss/preset-wind3'
import presetAttributify from '@unocss/preset-attributify'
import presetIcons from '@unocss/preset-icons'

const DEFAULT_OFEED_PROXY_TARGET = 'http://localhost:3001'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  const ofeedProxyTarget =
    env.VITE_OFEED_PROXY_TARGET ?? DEFAULT_OFEED_PROXY_TARGET

  return {
    base: env.VITE_BASE_URL ?? '/',
    server: {
      proxy: {
        '/api/ofeed': {
          target: ofeedProxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/ofeed/, ''),
        },
      },
    },
    plugins: [
      vue(),
      Unocss({
        presets: [presetWind3(), presetAttributify(), presetIcons()],
        theme: {
          colors: {
            header: '#0B5351',
            male: '#00A9A5',
            female: '#B8336A',
            neutral: '#544E61',
            even: '#EFEFEF',
            highlight: '#FA7921',
          },
          fontFamily: {
            mrb: ['"Space Grotesk"', 'Arial'],
          },
          fontSize: {
            'table-large': '2rem',
            'table-small': '1.75rem',
          },
        },
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
