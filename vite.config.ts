import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  server: { port: Number(process.env.PORT || 3000) },
  plugins: [
    remix({
      ignoredRouteFiles: ["**/.*", "**/*.test.ts", "**/*.test.tsx"],
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
      },
    }),
    tsconfigPaths(),
  ],
  build: { assetsInlineLimit: 0 },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "app/**/*.test.ts"],
  },
});
