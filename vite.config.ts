import { defineConfig } from "vite";

export default defineConfig({
  server: {
    // leading dot also matches ngrok's per-tunnel subdomains
    allowedHosts: [".ngrok-free.app"],
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
