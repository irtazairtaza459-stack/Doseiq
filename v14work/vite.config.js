import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  build: { outDir: '../client/dist', emptyOutDir: true },
  server: {
    host: '0.0.0.0',
    // Allows Cloudflare Quick Tunnel hostnames without having to edit this file
    // every time a new temporary trycloudflare.com URL is generated.
    allowedHosts: ['.trycloudflare.com'],
    proxy: { '/api': 'http://localhost:3000' },
  },
});
