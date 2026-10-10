import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    fs: {
      // Keep local personal backups inaccessible even to the development server.
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.private/**"],
    },
  },
});
