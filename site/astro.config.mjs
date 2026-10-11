import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// `npm run dev` forwards the order API to the Node server (cd ../server && npm start).
// `astro preview` does NOT proxy; in production nginx does the same job (see docs/DEPLOY-UBUNTU.md).
const api = { '/api': 'http://127.0.0.1:3000', '/admin': 'http://127.0.0.1:3000' };

export default defineConfig({
  integrations: [tailwind({ applyBaseStyles: false })],
  compressHTML: true,
  build: { inlineStylesheets: 'always' },
  vite: { server: { proxy: api } },
});
