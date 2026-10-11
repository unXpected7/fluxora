import { defineConfig, devices } from '@playwright/test';

const backendPort = '4400';
const frontendPort = '5174';
const databaseUrl = process.env.PLAYWRIGHT_DATABASE_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('Set PLAYWRIGHT_DATABASE_URL to a disposable, migrated, seeded PostgreSQL database before running browser E2E.');
}

const portalOrigins = `http://localhost:${frontendPort},http://admin.localhost:${frontendPort},http://partner.localhost:${frontendPort}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    headless: true,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run dev',
      cwd: '../backend',
      url: `http://127.0.0.1:${backendPort}/healthz`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: 'development',
        PORT: backendPort,
        DATABASE_URL: databaseUrl,
        CLIENT_ORIGIN: portalOrigins,
        STAFF_CLIENT_ORIGIN: `http://admin.localhost:${frontendPort},http://partner.localhost:${frontendPort}`,
      },
    },
    {
      command: `npm run dev -- --port ${frontendPort}`,
      cwd: '.',
      url: `http://127.0.0.1:${frontendPort}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_BACKEND_URL: `http://localhost:${backendPort}` },
    },
  ],
});
