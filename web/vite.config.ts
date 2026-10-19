import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// The React app is served at /v2 alongside the current app at the site root
// until every section has moved across (see claude/specs/react-rewrite-scope.md).
export default defineConfig({
  base: "/v2/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      scope: "/v2/",
      manifest: {
        name: "Coach Tools",
        short_name: "Coach Tools",
        start_url: "/v2/",
        scope: "/v2/",
        display: "standalone",
        background_color: "#f4f6f9",
        theme_color: "#0b2545",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" }
        ]
      },
      workbox: {
        // App shell only. Supabase calls always go to the network.
        globPatterns: ["**/*.{js,css,html,png,svg,webmanifest}"],
        navigateFallback: "/v2/index.html",
        navigateFallbackAllowlist: [/^\/v2\//],
        cleanupOutdatedCaches: true
      }
    })
  ]
});
