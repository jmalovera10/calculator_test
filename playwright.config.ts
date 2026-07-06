import { defineConfig } from '@playwright/test';

// Set by docker-compose for the containerized run (points at the frontend
// service on the Compose network). When unset, we're running locally and
// spawn the real backend + frontend dev servers ourselves.
const baseURL = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: baseURL ?? 'http://localhost:4173',
  },
  webServer: baseURL
    ? undefined
    : [
        {
          command: 'go run ./cmd/server',
          cwd: './backend',
          port: 8080,
          reuseExistingServer: !process.env.CI,
        },
        {
          command: 'npm run preview',
          cwd: './frontend',
          port: 4173,
          reuseExistingServer: !process.env.CI,
        },
      ],
});
