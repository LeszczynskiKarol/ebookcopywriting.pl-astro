import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://www.ebookcopywriting.pl",
  integrations: [
    tailwind(),
    sitemap({
      filter: (page) =>
        !page.includes("/sukces") &&
        !page.includes("/anulowano"),
    }),
  ],
  output: "static",
});
