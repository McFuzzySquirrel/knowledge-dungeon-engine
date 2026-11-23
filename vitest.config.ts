import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    // The side-scroller example owns its own package, config, and tests.
    exclude: [...configDefaults.exclude, 'examples/**'],
  },
});
