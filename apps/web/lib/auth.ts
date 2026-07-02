// Self-contained session auth (HMAC-signed cookie). No external service, so it
// works offline and is fully under our control. Credentials + secret come from
// env, with safe defaults for local single-operator use.

export const COOKIE_NAME = "zensil_session";
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

const AUTH_EMAIL = process.env.APP_AUTH_EMAIL || "office@zensil.in";
const AUTH_PASSWORD = process.env.APP_AUTH_PASSWORD || "Zensil@1234";
const AUTH_SECRET = process.env.APP_AUTH_SECRET || "zensil-dev-secret-change-in-production";

const enc = new TextEncoder();

async function hmacHex(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function checkCredentials(email: string, password: string): boolean {
  return email.trim().toLowerCase() === AUTH_EMAIL.toLowerCase() && password === AUTH_PASSWORD;
}

export async function createToken(email: string): Promise<string> {
  const payload = btoa(JSON.stringify({ e: email, exp: Date.now() + SEVEN_DAYS }));
  const sig = await hmacHex(payload);
  return `${payload}.${sig}`;
}

export async function verifyToken(token: string | undefined | null): Promise<{ email: string } | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if ((await hmacHex(payload)) !== sig) return null;
  try {
    const { e, exp } = JSON.parse(atob(payload));
    if (typeof exp !== "number" || Date.now() > exp) return null;
    return { email: e };
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = SEVEN_DAYS / 1000;
