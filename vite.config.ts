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
    host: process.env.VITE_HOST || "localhost",
    proxy: {
      "/whisper": {
        target: `http://${process.env.WHISPER_HOST || "localhost"}:8000`,
        rewrite: (path) => path.replace(/^\/whisper/, ""),
      },
    },
  },
});
