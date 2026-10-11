import { defineConfig } from "vite";
export default defineConfig({
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          temporal: ["@js-temporal/polyfill"],
          xml: ["@xmldom/xmldom"],
        },
      },
    },
  },
  server: { host: "127.0.0.1" },
});
