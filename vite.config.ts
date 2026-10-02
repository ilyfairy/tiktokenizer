import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) } },
  worker: { format: "es" },
  // Prepare lazy editor/worker dependencies before the first request so the
  // development server never reloads an in-progress large text edit to optimize them.
  optimizeDeps: {
    include: [
      "@chenglou/pretext",
      "@codemirror/state",
      "@codemirror/view",
      "@codemirror/commands",
    ],
  },
  server: { host: "127.0.0.1", port: 3000 },
  preview: { host: "127.0.0.1", port: 3000 },
  build: { outDir: "out", target: "es2022", emptyOutDir: true },
});
