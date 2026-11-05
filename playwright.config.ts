import { defineConfig, devices } from "@playwright/test";

// No web servers: e2e/mock.ts serves the fixture site and mock API via route interception.
export default defineConfig({
  testDir: "e2e",
  use: { trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
