import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { apiRoutes } from "./vite-plugin-api";

export default defineConfig(({ mode }) => {
  // The /api handlers read process.env, as on Vercel. Nothing here is VITE_-prefixed,
  // so none of it reaches the browser bundle.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  return {
    server: { port: 8080 },
    plugins: [react(), apiRoutes()],
    resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  };
});
