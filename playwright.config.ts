import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Opt-in browser smoke tests: `npm run test:e2e` (needs `npx playwright install chromium` once).
const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // The production build, like `npm start`; data goes to a temp folder, never to data/db.json.
    command: 'node node_modules/next/dist/bin/next start',
    url: `http://localhost:${port}/api/forms`,
    env: { PORT: String(port), DATA_DIR: path.join(os.tmpdir(), 'student-forms-e2e'), NEXT_TELEMETRY_DISABLED: '1' },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
