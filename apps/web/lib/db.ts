import "server-only";
import { Pool } from "pg";

// Server-only pooled connection to the warehouse (Neon). The connection string
// is never exposed to the browser. When DATABASE_URL is absent the dashboard
// falls back to the built-in sample data.
let pool: Pool | null = null;

export function warehouseEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL!;
    pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30_000,
      ssl: /neon\.tech|supabase|amazonaws/.test(connectionString) ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

export async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await getPool().query(text, params);
  return res.rows as T[];
}

export async function q1<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T> {
  const rows = await q<T>(text, params);
  return rows[0];
}
