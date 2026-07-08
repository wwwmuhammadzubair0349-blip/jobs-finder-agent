import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// SPA build → dist/. Pages Functions live in ../functions and are served by
// Cloudflare Pages alongside the static assets. During `vite dev` use
// `wrangler pages dev` in front to exercise the Functions + KV binding.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
