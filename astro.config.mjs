import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://www.ebookcopywriting.pl',
  integrations: [tailwind()],
  output: 'static',
});
