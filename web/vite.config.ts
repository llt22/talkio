import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../src"),
      "@web": path.resolve(__dirname, "src"),
    },
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom')) return 'react-vendor';
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-router')) return 'react-vendor';
          if (id.includes('node_modules/radix-ui') || id.includes('node_modules/@radix-ui')) return 'ui-vendor';
          if (id.includes('node_modules/lucide-react')) return 'ui-vendor';
          if (id.includes('node_modules/react-markdown') || id.includes('node_modules/remark-') || id.includes('node_modules/rehype-')) return 'markdown';
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
