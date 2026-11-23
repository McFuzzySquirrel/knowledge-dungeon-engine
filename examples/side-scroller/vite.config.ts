import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The engine source uses `@/…` imports internally. One alias serves both the engine
// and the example's type-only imports of engine modules.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../../src', import.meta.url)),
    },
  },
  server: { port: 5174 },
});
