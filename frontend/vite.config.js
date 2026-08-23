import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
  },
  // Railway routes requests through a public `*.up.railway.app` hostname.
  // A leading dot permits Railway subdomains without allowing arbitrary hosts.
  preview: {
    allowedHosts: [".up.railway.app"],
  },
});
