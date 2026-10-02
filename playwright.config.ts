import { defineConfig } from "@playwright/test";
const external = process.env.E2E_BASE_URL;
export default defineConfig({
  testDir: "./tests",
  timeout: 45_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: external ?? "http://127.0.0.1:4173",
    browserName: "chromium",
    channel:
      process.env.PLAYWRIGHT_CHANNEL ??
      (process.platform === "win32" ? "chrome" : undefined),
    viewport: { width: 1280, height: 960 },
    trace: "retain-on-failure",
  },
  webServer: external
    ? undefined
    : {
        command: "pnpm preview --port 4173 --strictPort",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: false,
      },
});
