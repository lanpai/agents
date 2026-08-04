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
    allowedHosts: [".ngrok-free.app"],
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
