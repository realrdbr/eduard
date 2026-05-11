import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    cors: {
      origin: [
        "https://gymolb.eduard.services",
        "https://*.eduard.services",
        /^https:\/\/.*\.eduard\.services$/
      ],
      credentials: true
    }
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
