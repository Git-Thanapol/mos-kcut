import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// `npm run dev` forwards the order API to the Node server (cd ../server && npm start).
// `astro preview` does NOT proxy; in production nginx does the same job (see docs/DEPLOY-UBUNTU.md).
const api = { '/api': 'http://127.0.0.1:3000', '/admin': 'http://127.0.0.1:3000' };

// KCUT lives under spvdo.com/kcut; the order API and /admin stay at the domain root.
export default defineConfig({
  base: '/kcut',
  integrations: [tailwind({ applyBaseStyles: false })],
  compressHTML: true,
  build: { inlineStylesheets: 'always' },
  vite: { server: { proxy: api } },
});
