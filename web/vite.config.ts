import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  build: {
    sourcemap: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-")) {
            return "charts";
          }
          if (
            id.includes("node_modules/jspdf") ||
            id.includes("node_modules/html2canvas") ||
            id.includes("node_modules/dompurify")
          ) {
            return "export-pdf";
          }
          if (id.includes("node_modules/lucide-react")) {
            return "icons";
          }
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) {
            return "react-vendor";
          }
          if (
            id.includes("/pages/dashboards/LaborerHome") ||
            id.includes("/pages/dashboards/VetFieldHub") ||
            id.includes("/pages/farm/FarmCheckinPage") ||
            id.includes("/pages/farm/FarmFeedPage") ||
            id.includes("/pages/farm/FarmMortalityLogPage") ||
            id.includes("/pages/farm/FarmVetLogsPage") ||
            id.includes("/pages/farm/FarmTreatmentPage")
          ) {
            return "field-shell";
          }
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      // One release flushed stale navigateFallback SWs. Keep a normal SW now —
      // selfDestroying caused reload loops for some installed clients.
      selfDestroying: false,
      includeAssets: ["logo.svg", "apple-touch-icon.png", "pwa-192.png", "pwa-512.png", "pwa-maskable-512.png"],
      manifest: {
        id: "/",
        name: "Clevafarm",
        short_name: "Clevafarm",
        description: "Clevafarm operations platform",
        theme_color: "#0F8F78",
        background_color: "#F4FAF8",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "pwa-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        cacheId: "cleva-farm-v2",
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2,webmanifest}"],
        globIgnores: ["**/charts-*.js", "**/export-pdf-*.js"],
        // No navigateFallback — same trap POS already removed.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/auth/"),
            handler: "NetworkOnly",
            method: "GET",
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/auth/"),
            handler: "NetworkOnly",
            method: "POST",
          },
          {
            urlPattern: ({ url }) =>
              url.pathname === "/api/bootstrap" ||
              url.pathname === "/api/flocks" ||
              url.pathname === "/api/me/aggregate-checkin-status" ||
              url.pathname === "/api/reference-options" ||
              url.pathname.startsWith("/api/check-ins/pending") ||
              url.pathname.startsWith("/api/feed-entries/pending") ||
              url.pathname.startsWith("/api/mortality-events/pending"),
            handler: "NetworkFirst",
            options: {
              cacheName: "cleva-farm-api",
              networkTimeoutSeconds: 4,
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 60 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
});
