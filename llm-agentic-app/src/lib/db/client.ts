import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

function getNormalizedDatabaseUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    // Direct Supabase host (e.g. db.<ref>.supabase.co) only resolves to IPv6,
    // which is not reachable from Vercel / AWS Lambda serverless functions.
    // Convert to the IPv4-compatible Supabase connection pooler on port 6543 (transaction mode).
    if (u.hostname.startsWith("db.") && u.hostname.endsWith(".supabase.co")) {
      const projectRef = u.hostname
        .replace(/^db\./, "")
        .replace(/\.supabase\.co$/, "");
      u.hostname = "aws-1-ap-southeast-1.pooler.supabase.com";
      u.port = "6543";
      if (!u.username.includes(".")) {
        u.username = `${u.username}.${projectRef}`;
      }
      return u.toString();
    }
  } catch {
    // fallback to rawUrl
  }
  return rawUrl;
}

const connectionString = getNormalizedDatabaseUrl(env.DATABASE_URL);

const isLocal =
  connectionString.includes("localhost") ||
  connectionString.includes("127.0.0.1");

export const client = postgres(connectionString, {
  prepare: false,
  ssl: isLocal ? false : "require",
  max: 1,
  idle_timeout: 20,
  connect_timeout: 15,
});
export const db = drizzle(client, { schema });
