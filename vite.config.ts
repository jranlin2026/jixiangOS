import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const useBackendApi = env.VITE_USE_BACKEND_API ?? 'true';

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_USE_BACKEND_API': JSON.stringify(useBackendApi),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: '127.0.0.1',
      port: 3000,
      strictPort: true,
      open: true,
      proxy: {
        '/api': 'http://127.0.0.1:3001',
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            mui: ['@mui/material', '@mui/icons-material'],
            charts: ['recharts'],
            dnd: ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          },
        },
      },
    },
  };
});
