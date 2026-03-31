import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tailwindcss()],
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
  },
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
