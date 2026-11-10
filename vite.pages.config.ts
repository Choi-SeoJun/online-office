import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('./web', import.meta.url)),
  base: '/online-office/',
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  plugins: [react()],
  resolve: { alias: { '@': root } },
  css: { postcss: root },
  define: {
    __OFFICE_ASSET_BASE__: JSON.stringify('/online-office/'),
    __OFFICE_ROOM_ENDPOINT__: JSON.stringify('https://office-break-01a1bf07.mobilechrysanthemum1.chatgpt.site/api/rooms'),
  },
  build: {
    outDir: fileURLToPath(new URL('./dist-pages', import.meta.url)),
    emptyOutDir: true,
  },
  preview: { host: '127.0.0.1', port: 5174, strictPort: true },
});
