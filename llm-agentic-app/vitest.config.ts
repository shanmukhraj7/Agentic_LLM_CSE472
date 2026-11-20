import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      GROQ_API_KEY: "dummy-groq-key",
      GEMINI_API_KEY: "dummy-gemini-key",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/postgres",
      SUPABASE_SERVICE_ROLE_KEY: "dummy-supabase-service-role-key",
      CRON_SECRET: "dummy-cron-secret",
      NEXT_PUBLIC_SUPABASE_URL: "https://dummy.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "dummy-supabase-anon-key",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
