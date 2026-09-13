import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// SWC is required so Nest's decorators + emitDecoratorMetadata work under Vitest.
export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
  },
  plugins: [swc.vite({ module: { type: "es6" } })],
});
