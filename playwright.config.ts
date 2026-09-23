import {defineConfig,devices} from '@playwright/test';
import {env} from 'node:process';

const alternateChromium=env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
export default defineConfig({
  testDir:'./tests/browser',
  timeout:45_000,
  expect:{timeout:15_000},
  use:{...devices['Desktop Chrome'],baseURL:'http://127.0.0.1:4173',serviceWorkers:'allow',
    ...(alternateChromium?{launchOptions:{executablePath:alternateChromium,
      args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--disable-dev-shm-usage']}}:{})},
  webServer:{command:'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url:'http://127.0.0.1:4173',reuseExistingServer:false,timeout:30_000},
});
