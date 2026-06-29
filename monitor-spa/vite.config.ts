import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "../src-tauri/dist-monitor",
    emptyOutDir: true,
  },
  server: {
    port: 4000,
    strictPort: true,
  },
});