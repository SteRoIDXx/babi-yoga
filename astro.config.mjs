// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// GitHub Pages braucht einen base-Pfad (/repo-name),
// der Hetzner VPS später nicht.
const isGitHubPages = process.env.GITHUB_ACTIONS === 'true';

// https://astro.build/config
export default defineConfig({
  site: isGitHubPages
    ? 'https://steroidxx.github.io'
    : 'https://babi-yoga.com',
  base: isGitHubPages ? '/babi-yoga' : '/',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
