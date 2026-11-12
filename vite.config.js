import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  publicDir: false,
  plugins: [vue()],
  build: {
    outDir: "public",
    emptyOutDir: false,
    lib: {
      entry: "src/vue/entry.js",
      formats: ["es"],
      fileName: "vue-pages",
    },
  },
});
