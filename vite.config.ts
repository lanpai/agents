import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: new URL("index.html", import.meta.url).pathname,
        vote: new URL("vote.html", import.meta.url).pathname,
      },
    },
  },
  server: {
    // leading dot also matches ngrok's per-tunnel subdomains
    allowedHosts: [".ngrok-free.app", "tinybox.alpaca-elnath.ts.net"],
    proxy: {
      "/api": `http://localhost:${process.env.API_PORT ?? 3002}`,
    },
  },
});
