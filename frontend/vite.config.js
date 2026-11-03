import {defineConfig, loadEnv} from 'vite';
import react from '@vitejs/plugin-react';

// Local development: Vite forwards API calls to Uvicorn.
// Production: set VITE_API_URL to the deployed backend origin.
export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const target = env.VITE_DEV_API_TARGET || 'http://127.0.0.1:8000';
  return {
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {target, changeOrigin: true},
      '/health': {target, changeOrigin: true},
      '/ready': {target, changeOrigin: true},
    },
  },
  };
});
