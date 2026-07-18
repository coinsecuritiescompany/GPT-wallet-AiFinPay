import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig(({ mode }) => {
  const vault = mode === "vault";
  return {
    plugins: [react(), viteSingleFile()],
    build: {
      target: "es2022",
      cssCodeSplit: false,
      assetsInlineLimit: 100_000_000,
      outDir: vault ? "dist-vault" : "dist",
      emptyOutDir: true,
      rollupOptions: vault ? { input: "vault.html" } : undefined
    },
    server: { port: 5173 }
  };
});
