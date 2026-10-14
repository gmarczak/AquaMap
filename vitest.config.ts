import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["lib/**/*.test.ts", "supabase/functions/**/*.test.ts"],
    env: { TZ: "America/Los_Angeles" }, // testy nie mogą zależeć od strefy maszyny
    environment: "node",
  },
});
