import "server-only";
import { Pool } from "pg";

// Server-only pooled connection to the warehouse (Neon). The connection string
// is never exposed to the browser. When DATABASE_URL is absent the dashboard
// falls back to the built-in sample data.
let pool: Pool | null = null;

export function warehouseEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/*
  pg 8.22 reads `sslmode` out of the connection string and treats require,
  prefer and verify-ca as aliases for verify-full. Against Neon that never
  completes its handshake here, and because the `ssl` option below already
  states the TLS policy, the parameter only ever contradicts it. Strip it so
  the two cannot disagree — the string stays valid for psycopg, which the ETL
  uses and which needs `sslmode=require`, so the same value can be pasted into
  DATABASE_URL for both (render.yaml tells you to copy it from etl/.env).
*/
function stripSslMode(cs: string): string {
  const i = cs.indexOf("?");
  if (i === -1) return cs;
  const params = cs
    .slice(i + 1)
    .split("&")
    .filter((p) => p && !/^sslmode=/i.test(p));
  return params.length ? `${cs.slice(0, i)}?${params.join("&")}` : cs.slice(0, i);
}

function getPool(): Pool {
  if (!pool) {
    const connectionString = stripSslMode(process.env.DATABASE_URL!);
    pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30_000,
      // Without this pg waits forever, so an unreachable warehouse hangs the
      // request instead of failing it: /api/health never answers, Render's
      // health check times out and the deploy fails over a database problem no
      // redeploy can fix. Failing is recoverable — the error panel reads the
      // reason and the page retries. 15s clears a Neon cold start (~7-10s).
      connectionTimeoutMillis: 15_000,
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
