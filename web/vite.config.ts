import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// The React app is the site root. The classic (pre-React) app is kept at
// /classic/ as a fallback, and old /v2/ links redirect (netlify.toml).
// Its service worker is /sw.js, the same URL the classic app used, so phones
// that installed the classic app pick up this one as an ordinary update.
export default defineConfig({
  base: "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      scope: "/",
      manifest: {
        name: "Coach Tools",
        short_name: "Coach Tools",
        start_url: "/",
        scope: "/",
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
        navigateFallback: "/index.html",
        // Leave the classic app's pages to the network (and its own service worker).
        navigateFallbackDenylist: [/^\/classic\//],
        cleanupOutdatedCaches: true
      }
    })
  ]
});
