import { z } from "zod";

const serverSchema = z.object({
  GROQ_API_KEY: z.string().min(1, "GROQ_API_KEY is required"),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  CRON_SECRET: z.string().min(1, "CRON_SECRET is required"),
  REMOTIVE_API_URL: z.string().url().optional(),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1, "NEXT_PUBLIC_SUPABASE_URL is required"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
});

const envSchema = serverSchema.merge(clientSchema);

export type Env = z.infer<typeof envSchema>;

const serverKeys = new Set<string>([
  "GROQ_API_KEY",
  "GEMINI_API_KEY",
  "DATABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CRON_SECRET",
  "REMOTIVE_API_URL",
]);

const isServer = typeof window === "undefined";

let parsedEnv: Env;

if (isServer) {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errorMessages = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Missing or invalid environment variables:\n${errorMessages}`);
  }
  parsedEnv = result.data;
} else {
  const result = clientSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!result.success) {
    const errorMessages = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Missing or invalid client environment variables:\n${errorMessages}`);
  }
  parsedEnv = result.data as Env;
}

export const env: Env = new Proxy(parsedEnv, {
  get(target, prop) {
    if (typeof prop === "string" && serverKeys.has(prop)) {
      if (typeof window !== "undefined") {
        throw new Error(
          `Cannot access server-side environment variable "${prop}" in the browser.`
        );
      }
    }
    return target[prop as keyof Env];
  },
});

export default env;
