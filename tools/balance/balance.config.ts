// The autopilot's Playwright config: the game's own config (same browser, same build),
// pointed at tools/balance/ instead of the tests. Run: npm run balance (see autopilot.spec.ts).
import { defineConfig } from '@playwright/test';
import base from '../../playwright.config';

export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: 'autopilot.spec.ts',
  fullyParallel: true,
  workers: Number(process.env.BALANCE_WORKERS) || 8,
  timeout: 0,
  reporter: 'line',
});
