// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  site: 'https://babi-yoga.com',
  adapter: node({ mode: 'standalone' }),
  integrations: [sitemap()],
  security: {
    checkOrigin: false, // Eigene CSRF-Token-Validierung in auth.ts
  },
  build: {
    inlineStylesheets: 'always',
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
