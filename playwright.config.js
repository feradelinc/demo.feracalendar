import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/ui",
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:4179", headless: true },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:4179",
    reuseExistingServer: !process.env.CI,
  },
  reporter: "list",
});
