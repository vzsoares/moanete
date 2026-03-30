import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/whisper": {
        target: "http://localhost:8000",
        rewrite: (path) => path.replace(/^\/whisper/, ""),
      },
    },
  },
});
