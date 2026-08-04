import { defineConfig } from "vite";

export default defineConfig({
  server: {
    // leading dot also matches ngrok's per-tunnel subdomains
    allowedHosts: [".ngrok-free.app", "tinybox.alpaca-elnath.ts.net"],
    proxy: {
      "/api": `http://localhost:${process.env.API_PORT ?? 3002}`,
    },
  },
});
