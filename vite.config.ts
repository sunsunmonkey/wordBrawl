import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tsconfigPaths from "vite-tsconfig-paths";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const freeApiTarget = env.VITE_FREE_API_BASE_URL || 'https://word-brawl.vercel.app';

  return {
    build: {
      sourcemap: 'hidden',
    },
    server: {
      proxy: {
        '/api': {
          target: freeApiTarget,
          changeOrigin: true,
          secure: true,
        },
      },
    },
    plugins: [
      react(),
      tsconfigPaths()
    ],
  };
})
