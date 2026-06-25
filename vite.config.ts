import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tsconfigPaths from "vite-tsconfig-paths";
import { traeBadgePlugin } from 'vite-plugin-trae-solo-badge';

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
      traeBadgePlugin({
        variant: 'dark',
        position: 'bottom-right',
        prodOnly: true,
        clickable: true,
        clickUrl: 'https://www.trae.ai/solo?showJoin=1',
        autoTheme: true,
        autoThemeTarget: '#root'
      }), 
      tsconfigPaths()
    ],
  };
})
