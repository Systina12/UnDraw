import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
  testDir:'./tests/browser',
  timeout:45_000,
  expect:{timeout:15_000},
  use:{...devices['Desktop Chrome'],baseURL:'http://127.0.0.1:4173',serviceWorkers:'allow'},
  webServer:{command:'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url:'http://127.0.0.1:4173',reuseExistingServer:false,timeout:30_000},
});
