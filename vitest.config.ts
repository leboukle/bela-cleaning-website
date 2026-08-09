import { defineConfig } from "vitest/config";
import path from "node:path";

// Mostly server-side/unit tests (booking validation, pricing, availability,
// auth token exchange, etc.) — the default environment is plain Node, no
// jsdom. A handful of .test.tsx files render React components and opt into
// jsdom per-file via a `// @vitest-environment jsdom` comment at the top of
// the file, rather than paying the jsdom cost for every test. Mirrors the
// "@/..." path alias from tsconfig.json so test files can import app code
// the same way it does.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // The "server-only" package's default export unconditionally throws
      // (it only resolves to a harmless no-op under the "react-server"
      // bundler condition Next.js sets — see node_modules/server-only's
      // package.json). Vitest runs in plain Node, so alias it straight to
      // that no-op stub; every lib/booking/server/* module imports
      // "server-only" purely as a build-time guard, and its behavior is
      // otherwise untouched.
      "server-only": path.resolve(__dirname, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
