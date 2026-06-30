import { Pool } from "pg";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// This app is isolated in its own Postgres schema inside a shared Supabase
// project (alongside excel_to_ai etc.). Everything here stays inside this
// schema — never read/write public, auth, storage, or excel_to_ai.
const SCHEMA = "classroom_landingpage";

// Cache singletons on globalThis so Next.js dev HMR / serverless reuse don't
// leak a new Pool or GoTrueClient on every module reload.
const g = globalThis as unknown as {
  __lpPool?: Pool;
  __lpAnon?: SupabaseClient;
  __lpService?: SupabaseClient;
};

/**
 * Direct-Postgres pool for the dedicated app role (lp_classroom_landingpage).
 * `max: 10` stays well under the role's connection limit of 20. The role's
 * search_path is set to `classroom_landingpage`, so queries don't prefix the
 * schema. Returns null when CLASSROOM_LANDINGPAGE_DB_URL is unset (local UI
 * preview) so callers can degrade gracefully instead of crashing.
 */
export function getPool(): Pool | null {
  const url = process.env.CLASSROOM_LANDINGPAGE_DB_URL;
  if (!url) return null;
  if (!g.__lpPool) {
    g.__lpPool = new Pool({ connectionString: url, max: 10 });
  }
  return g.__lpPool;
}

/**
 * Browser-safe anon client (publishable key) scoped to this app's schema.
 * RLS governs what it can see. Returns null when env is not configured.
 */
export function getAnonClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  if (g.__lpAnon) return g.__lpAnon;
  // Cast: a non-"public" schema yields a differently-typed client generic that
  // the SupabaseClient alias can't infer. Tables are queried by string name, so
  // the erased type is fine.
  const client = createClient(url, key, {
    auth: { persistSession: false },
    db: { schema: SCHEMA },
  }) as unknown as SupabaseClient;
  g.__lpAnon = client;
  return client;
}

/**
 * Server-only secret/service-role client (bypasses RLS) scoped to this app's
 * schema. Never import into client code. Returns null when env is not
 * configured so server routes can log instead of crashing during preview.
 */
export function getServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  if (g.__lpService) return g.__lpService;
  // Cast: see getAnonClient — runtime schema string isn't a literal generic.
  const client = createClient(url, key, {
    auth: { persistSession: false },
    db: { schema: SCHEMA },
  }) as unknown as SupabaseClient;
  g.__lpService = client;
  return client;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.CLASSROOM_LANDINGPAGE_DB_URL);
}
