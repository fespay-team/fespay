import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: process.env.FESPAY_VITE_HOST ?? '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/v1': process.env.FESPAY_API_PROXY ?? 'http://127.0.0.1:3000',
      '/health': process.env.FESPAY_API_PROXY ?? 'http://127.0.0.1:3000',
    },
    hmr: process.env.FESPAY_HMR_PORT
      ? {
          protocol: 'wss',
          host: 'localhost',
          clientPort: Number(process.env.FESPAY_HMR_PORT),
        }
      : undefined,
  },
});
