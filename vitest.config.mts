import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  // The same "@/..." imports as tsconfig.json paths, for modules that use them at runtime.
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  // e2e/ holds Playwright tests (npm run test:e2e).
  test: { exclude: [...configDefaults.exclude, 'e2e/**'] },
});
